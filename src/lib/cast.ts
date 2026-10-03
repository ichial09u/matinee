"use client";

// ============================================================
// Google Cast — official Cast Application Framework (CAF) web
// sender SDK, loaded on demand straight from Google:
//   https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1
// (the ?loadCastFramework=1 flag is what exposes `cast.framework`)
//
// Media is cast onto the DEFAULT MEDIA RECEIVER (app id
// "CC1AD845"), so no developer-console receiver registration is
// needed — any Chromecast / Google TV works out of the box.
//
// The surface below is the small slice of the SDK Matinee uses:
//  - ensureCastSdk()    → injects Google's script once, resolves
//                         when `cast.framework` is live
//  - useCast()          → session state + device name + picker
//  - castLoadMedia()    → load a direct media URL (+metadata,
//                         poster, VTT captions, position, rate)
//                         on the current session
//  - subscribeRemote()  → live snapshots of the RemotePlayer
//  - remoteControls     → play/pause/seek/volume/mute commands
// ============================================================

import { useCallback, useEffect, useState } from "react";

// ---------- minimal typed surface of the SDK ----------
// (The full API is far larger; this is everything we touch.)

interface CastImage {
  url: string;
}

interface CastGenericMetadata {
  title: string;
  subtitle?: string;
  images?: CastImage[];
}

interface CastTrack {
  trackId: number;
  trackType: string;
  trackContentId: string;
  trackContentType: string;
  subtype?: string;
  name?: string;
  language?: string;
}

interface CastMediaInfo {
  contentId: string;
  contentType: string;
  metadata: CastGenericMetadata;
  tracks?: CastTrack[];
}

interface CastLoadRequest {
  currentTime: number;
  autoplay: boolean;
  activeTrackIds?: number[];
  playbackRate?: number;
}

interface CastRemotePlayer {
  currentTime: number;
  duration: number;
  volumeLevel: number;
  isMuted: boolean;
  isMediaLoaded: boolean;
  playerState: string;
  mediaInfo?: { contentId?: string } | null;
}

interface CastRemoteController {
  playOrPause(): void;
  seek(): void;
  setVolumeLevel(): void;
  muteOrUnmute(): void;
  addEventListener(type: string, handler: () => void): void;
  removeEventListener(type: string, handler: () => void): void;
}

interface CastSession {
  getCastDevice(): { friendlyName?: string };
  getMediaSession(): unknown | null;
  endSession(stopReceiver: boolean): Promise<void>;
  loadMedia(request: CastLoadRequest): Promise<unknown>;
}

interface CastContext {
  setOptions(options: {
    receiverApplicationId: string;
    autoJoinPolicy: string;
    resumeSavedSession?: boolean;
  }): void;
  getCastState(): string;
  requestSession(): Promise<unknown>;
  getCurrentSession(): CastSession | null;
  addEventListener(type: string, handler: () => void): void;
  removeEventListener(type: string, handler: () => void): void;
}

interface CastFramework {
  CastContext: { getInstance(): CastContext };
  RemotePlayer: new () => CastRemotePlayer;
  RemotePlayerController: new (
    player: CastRemotePlayer
  ) => CastRemoteController;
  RemotePlayerEventType: {
    CURRENT_TIME_CHANGED: string;
    PLAYER_STATE_CHANGED: string;
    IS_MEDIA_LOADED_CHANGED: string;
    VOLUME_LEVEL_CHANGED: string;
    IS_MUTED_CHANGED: string;
  };
  CastContextEventType: { CAST_STATE_CHANGED: string };
}

declare global {
  interface Window {
    cast?: { framework: CastFramework };
    __onGCastApiAvailable?: (isAvailable: boolean) => void;
  }
}

// window.chrome (the cast namespace rides on it in some builds)
function chromeCast(): {
  media: {
    MediaInfo: new (id: string, type: string) => CastMediaInfo;
    GenericMediaMetadata: new () => CastGenericMetadata;
    LoadRequest: new (info: CastMediaInfo) => CastLoadRequest;
    Track: new (id: number, type: string) => CastTrack;
    TrackType: { TEXT: string };
    TextTrackType: { CAPTIONS: string };
    DEFAULT_MEDIA_RECEIVER_APP_ID: string;
  };
  AutoJoinPolicy: { TAB_AND_ORIGIN_SCOPED: string };
  Image: new (url: string) => CastImage;
} | null {
  const c = (window as unknown as { chrome?: { cast?: object } }).chrome;
  const cc = (c as { cast?: object } | undefined)?.cast;
  return cc
    ? (cc as NonNullable<ReturnType<typeof chromeCast>>)
    : null;
}

// ---------- script loading (once per page) ----------

const CAST_SDK_URL =
  "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
const APP_ID_DEFAULT_RECEIVER = "CC1AD845"; // chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID

let sdkPromise: Promise<boolean> | null = null;

function framework(): CastFramework | null {
  return typeof window !== "undefined" && window.cast?.framework
    ? window.cast.framework
    : null;
}

/** Inject Google's sender script; resolves true when the framework is usable. */
export function ensureCastSdk(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<boolean>((resolve) => {
    const done = window.setTimeout(() => resolve(false), 15_000);
    window.__onGCastApiAvailable = (available: boolean) => {
      window.clearTimeout(done);
      resolve(Boolean(available && framework()));
    };
    const script = document.createElement("script");
    script.src = CAST_SDK_URL;
    script.async = true;
    script.onerror = () => {
      window.clearTimeout(done);
      resolve(false);
    };
    document.head.appendChild(script);
  });
  return sdkPromise;
}

let optionsSet = false;

/** Get the initialized CastContext (options set exactly once). */
function getContext(): CastContext | null {
  const fw = framework();
  if (!fw) return null;
  const ctx = fw.CastContext.getInstance();
  if (!optionsSet) {
    optionsSet = true;
    ctx.setOptions({
      receiverApplicationId:
        chromeCast()?.media.DEFAULT_MEDIA_RECEIVER_APP_ID ??
        APP_ID_DEFAULT_RECEIVER,
      autoJoinPolicy:
        chromeCast()?.AutoJoinPolicy.TAB_AND_ORIGIN_SCOPED ??
        "tab_and_origin_scoped",
      // Rejoin a session that survived a page reload
      resumeSavedSession: true,
    });
  }
  return ctx;
}

// ---------- React hook: session state, device name, picker ----------

export type CastUiState =
  | "loading" // SDK still downloading
  | "unavailable" // script blocked / failed
  | "no-devices" // scanned, nothing on the network
  | "idle" // devices around, not casting
  | "connecting"
  | "connected"; // casting to a device

export function useCast() {
  const [state, setState] = useState<CastUiState>("loading");
  const [deviceName, setDeviceName] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let detach: (() => void) | null = null;

    const refresh = () => {
      const ctx = getContext();
      if (!ctx) {
        setState("unavailable");
        setDeviceName(null);
        return;
      }
      switch (ctx.getCastState()) {
        case "CONNECTED":
          setState("connected");
          break;
        case "CONNECTING":
          setState("connecting");
          break;
        case "NO_DEVICES_FOUND":
          setState("no-devices");
          break;
        default:
          setState("idle");
      }
      setDeviceName(
        ctx.getCurrentSession()?.getCastDevice()?.friendlyName ?? null
      );
    };

    ensureCastSdk().then((ok) => {
      if (disposed) return;
      if (!ok) {
        setState("unavailable");
        return;
      }
      const ctx = getContext();
      if (!ctx) {
        setState("unavailable");
        return;
      }
      refresh();
      const evt =
        window.cast!.framework.CastContextEventType.CAST_STATE_CHANGED;
      ctx.addEventListener(evt, refresh);
      detach = () => ctx.removeEventListener(evt, refresh);
    });

    return () => {
      disposed = true;
      detach?.();
    };
  }, []);

  /** Open Google's device picker. Resolves once the user picks/cancels. */
  const requestSession = useCallback(
    (): Promise<"connected" | "cancelled" | "unavailable"> => {
      const ctx = getContext();
      if (!ctx) return Promise.resolve("unavailable");
      return ctx
        .requestSession()
        .then((err) => {
          // Resolves with an error code (e.g. "cancel") or nothing on success.
          return !err || err === "success"
            ? ("connected" as const)
            : err === "cancel"
              ? ("cancelled" as const)
              : ("unavailable" as const);
        })
        .catch(() => "unavailable" as const);
    },
    []
  );

  /** Stop casting and (by default) close the receiver app on the TV. */
  const endSession = useCallback((): Promise<void> => {
    const session = getContext()?.getCurrentSession();
    if (!session) return Promise.resolve();
    return Promise.resolve(session.endSession(true)).catch(() => undefined);
  }, []);

  return { state, deviceName, requestSession, endSession };
}

// ---------- load media on the receiver ----------

export interface CastMediaRequest {
  /** Direct, CORS/public media URL (mp4 / webm / ogv …) */
  url: string;
  contentType?: string;
  title: string;
  subtitle?: string;
  /** Shown on the TV while loading / in the backdrop */
  poster?: string;
  /** WebVTT captions (the receiver fetches them itself) */
  captions?: { url: string; language?: string; label?: string } | null;
  /** Enable the captions track right away */
  activeCaptions?: boolean;
  /** Where to start, in seconds */
  position?: number;
  autoplay?: boolean;
  playbackRate?: number;
}

function contentTypeFromUrl(url: string): string {
  if (/\.ogv($|[?#])/i.test(url)) return "video/ogg";
  if (/\.webm($|[?#])/i.test(url)) return "video/webm";
  return "video/mp4";
}

/** Load (or swap) media on the current cast session. */
export async function castLoadMedia(req: CastMediaRequest): Promise<void> {
  const session = getContext()?.getCurrentSession();
  const cc = chromeCast();
  if (!session || !cc) throw new Error("No cast session");

  const info = new cc.media.MediaInfo(
    req.url,
    req.contentType || contentTypeFromUrl(req.url)
  );
  const metadata = new cc.media.GenericMediaMetadata();
  metadata.title = req.title;
  if (req.subtitle) metadata.subtitle = req.subtitle;
  if (req.poster) metadata.images = [new cc.Image(req.poster)];
  info.metadata = metadata;

  if (req.captions?.url) {
    const track = new cc.media.Track(1, cc.media.TrackType.TEXT);
    track.trackContentId = req.captions.url;
    track.trackContentType = "text/vtt";
    track.subtype = cc.media.TextTrackType.CAPTIONS;
    track.name = req.captions.label || "English";
    track.language = req.captions.language || "en";
    info.tracks = [track];
  }

  const load = new cc.media.LoadRequest(info);
  load.currentTime = Math.max(0, Math.floor(req.position ?? 0));
  load.autoplay = req.autoplay ?? true;
  if (req.playbackRate && req.playbackRate !== 1) {
    load.playbackRate = req.playbackRate;
  }
  if (req.captions?.url && req.activeCaptions) {
    load.activeTrackIds = [1];
  }

  await session.loadMedia(load);
}

// ---------- remote player (live state + commands) ----------

export interface RemoteSnapshot {
  mediaLoaded: boolean;
  playing: boolean;
  buffering: boolean;
  time: number;
  duration: number;
  volume: number;
  muted: boolean;
  /** contentId of what the receiver is playing, if anything */
  mediaUrl: string | null;
}

let remotePlayer: CastRemotePlayer | null = null;
let remoteController: CastRemoteController | null = null;

function ensureRemote(): CastRemoteController | null {
  const fw = framework();
  if (!fw) return null;
  if (!remotePlayer || !remoteController) {
    remotePlayer = new fw.RemotePlayer();
    remoteController = new fw.RemotePlayerController(remotePlayer);
  }
  return remoteController;
}

export function getRemoteSnapshot(): RemoteSnapshot {
  const p = remotePlayer;
  if (!p) {
    return {
      mediaLoaded: false,
      playing: false,
      buffering: false,
      time: 0,
      duration: 0,
      volume: 1,
      muted: false,
      mediaUrl: null,
    };
  }
  return {
    mediaLoaded: Boolean(p.isMediaLoaded),
    playing: Boolean(p.isMediaLoaded && p.playerState === "PLAYING"),
    buffering: p.playerState === "BUFFERING",
    time: Number(p.currentTime) || 0,
    duration: Number(p.duration) || 0,
    volume: Number(p.volumeLevel) || 0,
    muted: Boolean(p.isMuted),
    mediaUrl: p.mediaInfo?.contentId ?? null,
  };
}

/**
 * Subscribe to the RemotePlayer. The callback fires on every
 * player/time/volume change while a cast session is live.
 */
export function subscribeRemote(
  onSnapshot: (snapshot: RemoteSnapshot) => void
): () => void {
  const fw = framework();
  const controller = ensureRemote();
  if (!fw || !controller || !remotePlayer) return () => undefined;

  const handler = () => onSnapshot(getRemoteSnapshot());
  const types = [
    fw.RemotePlayerEventType.CURRENT_TIME_CHANGED,
    fw.RemotePlayerEventType.PLAYER_STATE_CHANGED,
    fw.RemotePlayerEventType.IS_MEDIA_LOADED_CHANGED,
    fw.RemotePlayerEventType.VOLUME_LEVEL_CHANGED,
    fw.RemotePlayerEventType.IS_MUTED_CHANGED,
  ];
  for (const t of types) controller.addEventListener(t, handler);
  return () => {
    for (const t of types) controller.removeEventListener(t, handler);
  };
}

/** Commands routed to the receiver (no-ops when nothing is cast). */
export const remoteControls = {
  playOrPause() {
    ensureRemote()?.playOrPause();
  },
  seekTo(seconds: number) {
    const controller = ensureRemote();
    if (!controller || !remotePlayer) return;
    remotePlayer.currentTime = Math.max(0, seconds);
    controller.seek();
  },
  skip(delta: number) {
    if (!remotePlayer) return;
    remoteControls.seekTo((Number(remotePlayer.currentTime) || 0) + delta);
  },
  setVolume(level: number) {
    const controller = ensureRemote();
    if (!controller || !remotePlayer) return;
    remotePlayer.volumeLevel = Math.min(1, Math.max(0, level));
    controller.setVolumeLevel();
  },
  setMuted(muted: boolean) {
    const controller = ensureRemote();
    if (!controller || !remotePlayer) return;
    remotePlayer.isMuted = muted;
    controller.muteOrUnmute();
  },
};
