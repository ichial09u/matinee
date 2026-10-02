"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume1,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  ListVideo,
  SkipForward,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchDetails, fetchSeason, stillUrl } from "@/lib/api";
import { getProgress, progressKey, removeProgress, saveProgress } from "@/lib/progress";
import { enterImmersive, isPortrait, isTouchDevice } from "@/lib/immersive";
import type { MediaItem, Episode } from "@/lib/types";

// ============================================================
// Matinee's own player, Netflix style, on top of a CineSrc
// (cinesrc.st) embed. The embed runs with controls=false and is
// sandboxed with NO allow-popups, so provider popup ads can't
// open windows; a full-surface click shield keeps every pointer
// event for this player — the embed never sees a click. All chrome
// lives here: progress bar, play/pause, ±10s, volume, speed, next
// episode, episode picker and fullscreen. Communication is
// postMessage both ways (verified against cinesrc.st/docs).
// ============================================================

export interface PlayTarget {
  kind: "movie" | "tv";
  item: MediaItem;
  season?: number;
  episode?: number;
}

const CINESRC = "https://cinesrc.st";
const RATES = [0.5, 0.75, 1, 1.25, 1.5];
// The cinesrc server that last worked for this browser — replaying
// it on the next session skips most of the source-selection wait.
const LAST_SERVER_KEY = "matinee_last_server";

function fmt(t: number): string {
  if (!Number.isFinite(t) || t < 0) t = 0;
  const s = Math.floor(t % 60);
  const m = Math.floor(t / 60) % 60;
  const h = Math.floor(t / 3600);
  const ss = String(s).padStart(2, "0");
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${ss}`
    : `${m}:${ss}`;
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

export function PlayerView({
  target,
  onBack,
}: {
  target: PlayTarget;
  onBack: () => void;
}) {
  const item = target.item;
  const isTv = target.kind === "tv" && item.mediaType === "tv";

  // ---------- resume point (computed once) ----------
  const initial = useMemo(() => {
    const saved = getProgress(item);
    const season = target.season ?? saved?.season ?? 1;
    const episode = target.episode ?? saved?.episode ?? 1;
    let resume = 0;
    if (
      saved &&
      (isTv
        ? saved.season === season && saved.episode === episode
        : true) &&
      saved.duration > 0 &&
      saved.time > 45 &&
      saved.time < saved.duration - 60
    ) {
      resume = Math.floor(saved.time);
    }
    return { season, episode, resume };
  }, [item, isTv, target.season, target.episode]);

  // ---------- iframe src (changes only on external navigation) ----------
  const [src, setSrc] = useState(() => ({
    season: initial.season,
    episode: initial.episode,
    resume: initial.resume,
    nonce: 0,
  }));

  // ---------- displayed position (also follows in-player navigation) ----------
  const [display, setDisplay] = useState({
    season: initial.season,
    episode: initial.episode,
  });

  // Server that worked last time (read once per mount; updated by
  // cinesrc:sourceused below — deliberately NOT wired into embedUrl
  // afterwards, so the iframe never reloads mid-playback).
  const [initialServer] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LAST_SERVER_KEY);
    } catch {
      return null;
    }
  });

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [rate, setRate] = useState(1);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [episodesOpen, setEpisodesOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [slowHint, setSlowHint] = useState(false);
  const [portraitFallback, setPortraitFallback] = useState(false);
  const [drag, setDrag] = useState<{ active: boolean; ratio: number }>({
    active: false,
    ratio: 0,
  });

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaveRef = useRef(0);
  const timeRef = useRef(0);
  const durationRef = useRef(0);
  const currentRef = useRef({ season: initial.season, episode: initial.episode });
  const itemRef = useRef(item);
  const playingRef = useRef(false);
  const episodesOpenRef = useRef(false);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoImmersiveRef = useRef({ done: false, pending: false });

  // Mirrors of state for use inside timers / native callbacks.
  // (Updated in effects — never during render.)
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);
  useEffect(() => {
    episodesOpenRef.current = episodesOpen;
  }, [episodesOpen]);

  // Kill a pending single-tap when the surface unmounts
  useEffect(() => {
    const t = tapTimerRef;
    return () => {
      if (t.current) clearTimeout(t.current);
    };
  }, []);

  const key = progressKey(item);

  // ---------- embed URL ----------
  const embedUrl = useMemo(() => {
    const base = isTv
      ? `${CINESRC}/embed/tv/${item.id}?s=${src.season}&e=${src.episode}`
      : `${CINESRC}/embed/movie/${item.id}`;
    const p = new URLSearchParams({
      color: "#e50914",
      controls: "false",
      prioritize: "true",
      // The embed is behind our click shield, so its Skip Intro button
      // can never be tapped — autoskip handles intros for us instead.
      autoskip: "true",
    });
    // Go straight to the server that worked last time — cuts most
    // of the "connecting…" wait on repeat plays.
    if (initialServer) p.set("lastserver", initialServer);
    if (src.resume > 45) {
      p.set("t", String(src.resume));
      // We run our own resume UX — skip the embed's Continue/Restart prompt
      p.set("continueprompt", "false");
    }
    if (src.nonce > 0) p.set("_r", String(src.nonce));
    return `${base}${base.includes("?") ? "&" : "?"}${p.toString()}`;
  }, [isTv, item.id, src, initialServer]);

  // ---------- TV metadata ----------
  const detailQ = useQuery({
    queryKey: ["detail", item.mediaType, item.id],
    queryFn: () => fetchDetails(item.id, item.mediaType),
    enabled: isTv,
    staleTime: 600_000,
  });
  const seasonsList = detailQ.data?.seasonsList || [];

  const epsQ = useQuery({
    queryKey: ["season", item.id, display.season],
    queryFn: () => fetchSeason(item.id, display.season),
    enabled: isTv,
    staleTime: 600_000,
  });
  const currentEpisodeName =
    epsQ.data?.find((e) => e.number === display.episode)?.name || null;

  const currentSeasonEntry = seasonsList.find(
    (s) => s.number === display.season
  );
  const maxSeason = seasonsList.length
    ? Math.max(...seasonsList.map((s) => s.number))
    : display.season;
  const hasNextEpisode =
    isTv &&
    (display.episode < (currentSeasonEntry?.episodeCount ?? 0) ||
      display.season < maxSeason);

  // ---------- helpers ----------
  const send = useCallback((command: string, args: unknown[] = []) => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "cinesrc:command", command, args },
      CINESRC
    );
  }, []);

  const persist = useCallback(
    (t: number, d: number) => {
      if (d > 0 && t > 10 && t < d - 45) {
        saveProgress({
          key,
          item: itemRef.current,
          season: isTv ? currentRef.current.season : undefined,
          episode: isTv ? currentRef.current.episode : undefined,
          time: t,
          duration: d,
          updatedAt: Date.now(),
        });
      }
    },
    [key, isTv]
  );

  // ---------- auto immersive: flip to landscape fullscreen on play ----------
  // The click that opened the player keeps a warm user activation, so the
  // fullscreen request succeeds without a second tap. If the browser
  // disagrees, it's retried on the first play event and on any surface tap.
  const tryAutoImmersive = useCallback(() => {
    const st = autoImmersiveRef.current;
    if (st.done || st.pending) return;
    st.pending = true;
    enterImmersive(wrapRef.current)
      .then((ok) => {
        st.pending = false;
        if (ok) st.done = true;
      })
      .catch(() => {
        st.pending = false;
      });
  }, []);

  const poke = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (playingRef.current && !episodesOpenRef.current) {
        setControlsVisible(false);
      }
    }, 3000);
  }, []);

  // ---------- external navigation (swaps the iframe src) ----------
  const goToEpisode = useCallback(
    (season: number, episode: number) => {
      setSrc((s) => ({ ...s, season, episode, resume: 0, nonce: s.nonce + 1 }));
      currentRef.current = { season, episode };
      setDisplay({ season, episode });
      setTime(0);
      timeRef.current = 0;
      setEnded(false);
      setReady(false);
      setPlaying(false);
      playingRef.current = false;
      lastSaveRef.current = 0;
      setEpisodesOpen(false);
      poke();
    },
    [poke]
  );

  const replay = useCallback(() => {
    setSrc((s) => ({ ...s, resume: 0, nonce: s.nonce + 1 }));
    setTime(0);
    timeRef.current = 0;
    setEnded(false);
    setReady(false);
    setPlaying(false);
    playingRef.current = false;
    poke();
  }, [poke]);

  const goNext = useCallback(() => {
    const { season, episode } = currentRef.current;
    const entry = seasonsList.find((s) => s.number === season);
    if (episode < (entry?.episodeCount ?? 0)) goToEpisode(season, episode + 1);
    else if (season < maxSeason) goToEpisode(season + 1, 1);
  }, [goToEpisode, maxSeason, seasonsList]);

  // ---------- player commands ----------
  const togglePlay = useCallback(() => {
    if (ended) {
      replay();
      return;
    }
    const next = !playingRef.current;
    setPlaying(next);
    playingRef.current = next;
    send(next ? "play" : "pause");
    poke();
  }, [ended, poke, replay, send]);

  const seekBy = useCallback(
    (delta: number) => {
      const t = clamp(
        timeRef.current + delta,
        0,
        durationRef.current > 0 ? durationRef.current - 1 : timeRef.current + delta
      );
      send("seek", [Math.floor(t)]);
      setTime(t);
      timeRef.current = t;
      setEnded(false);
      poke();
    },
    [poke, send]
  );

  const toggleMute = useCallback(() => {
    const next = !muted;
    setMuted(next);
    send("setMuted", [next]);
    poke();
  }, [muted, poke, send]);

  const changeVolume = useCallback(
    (v: number) => {
      setVolume(v);
      setMuted(v === 0);
      send("setVolume", [v]);
      send("setMuted", [v === 0]);
      poke();
    },
    [poke, send]
  );

  const cycleRate = useCallback(() => {
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    setRate(next);
    send("setPlaybackRate", [next]);
    poke();
  }, [poke, rate, send]);

  const toggleFullscreen = useCallback(() => {
    const el = wrapRef.current as (HTMLDivElement & {
      webkitRequestFullscreen?: () => Promise<void>;
    }) | null;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else if (typeof el?.requestFullscreen === "function") {
      el.requestFullscreen().catch(() => {});
    } else {
      // iOS Safari fallback
      el?.webkitRequestFullscreen?.();
    }
  }, []);

  // ---------- effects ----------
  // Lock page scroll while the player is up
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Auto-flip into landscape fullscreen the moment the player opens,
  // and fall back to a CSS rotation when the browser can't lock
  // orientation (iOS Safari): the show still plays horizontal.
  useEffect(() => {
    tryAutoImmersive();
    if (!isTouchDevice()) return;
    const t = setTimeout(() => {
      if (isPortrait()) setPortraitFallback(true);
    }, 1100);
    const onOrient = () => {
      if (window.innerWidth > window.innerHeight) setPortraitFallback(false);
    };
    window.addEventListener("resize", onOrient);
    window.addEventListener("orientationchange", onOrient);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", onOrient);
      window.removeEventListener("orientationchange", onOrient);
    };
  }, [tryAutoImmersive]);

  // Initial auto-hide timer
  useEffect(() => {
    const t = setTimeout(() => {
      if (playingRef.current && !episodesOpenRef.current) {
        setControlsVisible(false);
      }
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  // Player events (postMessage from cinesrc.st)
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== CINESRC) return;
      const data = event.data as {
        type?: string;
        currentTime?: number;
        duration?: number;
        volume?: number;
        muted?: boolean;
        playbackRate?: number;
        season?: number;
        episode?: number;
        internalNavigation?: boolean;
        sourceId?: string | number;
        error?: string;
      };
      switch (data.type) {
        case "cinesrc:ready":
          setReady(true);
          setError(null);
          break;
        case "cinesrc:play":
          setPlaying(true);
          playingRef.current = true;
          tryAutoImmersive(); // covers a missed mount-time activation
          poke();
          break;
        case "cinesrc:pause":
          setPlaying(false);
          playingRef.current = false;
          setControlsVisible(true);
          break;
        case "cinesrc:timeupdate": {
          const t = Number(data.currentTime) || 0;
          const d = Number(data.duration) || 0;
          timeRef.current = t;
          durationRef.current = d;
          if (!drag.active) setTime(t);
          if (d > 0) setDuration(d);
          const now = Date.now();
          if (now - lastSaveRef.current > 5000) {
            lastSaveRef.current = now;
            persist(t, d);
          }
          break;
        }
        case "cinesrc:seeking":
        case "cinesrc:seeked": {
          const t = Number(data.currentTime) || 0;
          const d = Number(data.duration) || 0;
          timeRef.current = t;
          durationRef.current = d;
          setTime(t);
          if (d > 0) setDuration(d);
          break;
        }
        case "cinesrc:loadedmetadata":
          if (data.duration && data.duration > 0) {
            setDuration(Number(data.duration));
            durationRef.current = Number(data.duration);
          }
          break;
        case "cinesrc:volumechange":
          if (typeof data.muted === "boolean") setMuted(data.muted);
          if (typeof data.volume === "number") setVolume(data.volume);
          break;
        case "cinesrc:ratechange":
          if (data.playbackRate) setRate(Number(data.playbackRate));
          break;
        case "cinesrc:sourceused": {
          // Remember the stream server that just worked — the next
          // play session jumps straight to it.
          const sid = data.sourceId;
          if (sid !== undefined && sid !== null) {
            try {
              localStorage.setItem(LAST_SERVER_KEY, String(sid));
            } catch {
              // private mode — no memory, no problem
            }
          }
          break;
        }
        case "cinesrc:nextepisode": {
          const s = Number(data.season) || 1;
          const e = Number(data.episode) || 1;
          setEnded(false);
          if (data.internalNavigation) {
            // the player moved on by itself — sync state, don't reload
            currentRef.current = { season: s, episode: e };
            setDisplay({ season: s, episode: e });
            timeRef.current = 0;
            setTime(0);
            lastSaveRef.current = 0;
            if (isTv) {
              saveProgress({
                key,
                item: itemRef.current,
                season: s,
                episode: e,
                time: 0,
                duration: 0,
                updatedAt: Date.now(),
              });
            }
          } else {
            goToEpisode(s, e);
          }
          break;
        }
        case "cinesrc:ended":
          setPlaying(false);
          playingRef.current = false;
          setControlsVisible(true);
          if (!isTv) {
            setEnded(true);
            removeProgress(key);
          } else {
            // TV: autonext usually fires nextepisode right after this
            removeProgress(key);
          }
          break;
        case "cinesrc:error":
          setError(
            (data.error as string) || "Playback error. Try another title."
          );
          break;
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [drag.active, goToEpisode, isTv, key, persist, poke, tryAutoImmersive]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "SELECT" ||
          t.tagName === "TEXTAREA" ||
          t.closest("button, a, [role=button]"))
      ) {
        return; // let focused UI elements behave natively
      }
      switch (e.key) {
        case " ":
        case "k":
        case "K":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
        case "j":
        case "J":
          e.preventDefault();
          seekBy(-10);
          break;
        case "ArrowRight":
        case "l":
        case "L":
          e.preventDefault();
          seekBy(10);
          break;
        case "m":
        case "M":
          toggleMute();
          break;
        case "f":
        case "F":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "n":
        case "N":
          if (hasNextEpisode) {
            e.preventDefault();
            goNext();
          }
          break;
        case "Escape":
          if (episodesOpenRef.current) {
            setEpisodesOpen(false);
          } else if (!document.fullscreenElement) {
            onBack();
          }
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    goNext,
    hasNextEpisode,
    onBack,
    seekBy,
    toggleFullscreen,
    toggleMute,
    togglePlay,
  ]);

  // Fullscreen state sync
  useEffect(() => {
    const onFs = () =>
      setFullscreen(
        Boolean(document.fullscreenElement)
      );
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // Save progress when leaving
  useEffect(() => {
    return () => {
      persist(timeRef.current, durationRef.current);
    };
  }, [persist]);

  // Also persist when the tab is hidden or closed mid-playback
  useEffect(() => {
    const onSave = () => persist(timeRef.current, durationRef.current);
    window.addEventListener("pagehide", onSave);
    document.addEventListener("visibilitychange", onSave);
    return () => {
      window.removeEventListener("pagehide", onSave);
      document.removeEventListener("visibilitychange", onSave);
    };
  }, [persist]);

  // "Still connecting…" hint when sources take a while
  useEffect(() => {
    // Reset asynchronously (external trigger → state, per project convention)
    queueMicrotask(() => setSlowHint(false));
    if (ready || error) return;
    const t = setTimeout(() => setSlowHint(true), 12000);
    return () => clearTimeout(t);
  }, [ready, error, src]);

  // ---------- scrub ----------
  const ratioFromEvent = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return clamp((e.clientX - rect.left) / rect.width, 0, 1);
  };
  const onTrackDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ active: true, ratio: ratioFromEvent(e) });
  };
  const onTrackMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.active) return;
    setDrag({ active: true, ratio: ratioFromEvent(e) });
  };
  const onTrackUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.active) return;
    const ratio = ratioFromEvent(e);
    const t = Math.floor(ratio * duration);
    setDrag({ active: false, ratio: 0 });
    send("seek", [t]);
    setTime(t);
    timeRef.current = t;
    setEnded(false);
    poke();
  };

  const shownRatio =
    duration > 0 ? (drag.active ? drag.ratio : time / duration) : 0;

  // ---------- surface taps: single = play/pause, double = fullscreen ----------
  const onSurfaceClick = useCallback(() => {
    tryAutoImmersive(); // fresh user gesture — a good moment to retry
    poke();
    if (tapTimerRef.current) {
      // second tap within the window → double tap
      clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
      toggleFullscreen();
    } else {
      tapTimerRef.current = setTimeout(() => {
        tapTimerRef.current = null;
        togglePlay();
      }, 220);
    }
  }, [poke, tryAutoImmersive, toggleFullscreen, togglePlay]);

  // ---------- render ----------
  return (
    <div
      ref={wrapRef}
      role="region"
      aria-label={`Playing ${item.title}`}
      className="fixed inset-0 z-[100] select-none bg-black"
      onMouseMove={poke}
      onPointerDown={poke}
      style={{ cursor: controlsVisible ? "default" : "none" }}
    >
      {/* Inner surface — neutral state is display:contents (zero layout
          impact). When the browser can't lock orientation (iOS Safari, some
          Android WebViews) it becomes .force-landscape instead, rotating the
          whole player 90°. It must be an INNER element: the UA's fullscreen
          rules pin the fullscreen element itself to the screen and would
          override any rotation on it. */}
      <div className={cn("contents", portraitFallback && "force-landscape")}>
      {/* The video surface — sandboxed WITHOUT allow-popups and WITHOUT
          allow-top-navigation, so nothing inside the frame (or its nested
          provider frames, which inherit the flags) can open a popup, a new
          tab, or hijack this tab. That is what keeps the ads from popping. */}
      <iframe
        ref={iframeRef}
        src={embedUrl}
        title={`${item.title} player`}
        sandbox="allow-scripts allow-same-origin allow-presentation allow-forms"
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        allowFullScreen
        referrerPolicy="origin"
        className="absolute inset-0 h-full w-full border-0 bg-black"
        tabIndex={-1}
      />

      {/* Click shield — every pointer event on the video surface belongs to
          the Matinee player. The embed (and any fake "Play" overlays inside
          it) never receives a click, so click-bait ads have nothing to
          intercept. Single tap toggles play, double tap goes fullscreen. */}
      <div
        aria-hidden
        className="absolute inset-0 z-[5]"
        onClick={onSurfaceClick}
      />

      {/* Loading veil */}
      {!ready && !error && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black">
          <Loader2
            className="h-10 w-10 animate-spin text-[#e50914]"
            aria-hidden
          />
          <p className="text-[15px] font-semibold text-white/90">
            {item.title}
          </p>
          {slowHint && (
            <p className="max-w-xs px-6 text-center text-[13px] leading-relaxed text-white/50">
              Still connecting to a stream — some sources take a
              moment to warm up.
            </p>
          )}
        </div>
      )}

      {/* Error veil */}
      {error && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-black/90 px-6 text-center">
          <p className="max-w-md text-[16px] leading-relaxed text-white/90">
            {error}
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setReady(false);
                setSrc((s) => ({ ...s, nonce: s.nonce + 1 }));
              }}
              className="rounded-[4px] bg-white px-6 py-2 text-[15px] font-bold text-black transition-colors hover:bg-white/75"
            >
              Try Again
            </button>
            <button
              type="button"
              onClick={onBack}
              className="rounded-[4px] bg-[#6d6d6eb3] px-6 py-2 text-[15px] font-semibold text-white transition-colors hover:bg-[#6d6d6e66]"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {/* Ended veil (movies) */}
      {ended && !error && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-black/85 px-6 text-center">
          <p className="text-[13px] uppercase tracking-[0.28em] text-[#777]">
            You just watched
          </p>
          <h2 className="max-w-2xl text-3xl font-black text-white sm:text-5xl">
            {item.title}
          </h2>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={replay}
              className="inline-flex items-center gap-2 rounded-[4px] bg-white px-6 py-2.5 text-[15px] font-bold text-black transition-colors hover:bg-white/75"
            >
              <RotateCcw className="h-5 w-5" aria-hidden />
              Watch Again
            </button>
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-2 rounded-[4px] bg-[#6d6d6eb3] px-6 py-2.5 text-[15px] font-semibold text-white transition-colors hover:bg-[#6d6d6e66]"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden />
              Back to Browse
            </button>
          </div>
        </div>
      )}

      {/* Cinematic gradients (visible with the controls) */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/80 to-transparent transition-opacity duration-300",
          controlsVisible ? "opacity-100" : "opacity-0"
        )}
      />
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/90 to-transparent transition-opacity duration-300",
          controlsVisible ? "opacity-100" : "opacity-0"
        )}
      />

      {/* ---------- Top bar ---------- */}
      <div
        className={cn(
          "absolute inset-x-0 top-0 z-10 flex items-start gap-4 p-4 transition-opacity duration-300 md:p-6",
          controlsVisible
            ? "opacity-100"
            : "pointer-events-none opacity-0"
        )}
      >
        <button
          type="button"
          aria-label="Back to browse"
          onClick={onBack}
          className="mt-0.5 shrink-0 text-white transition-transform hover:scale-110"
        >
          <ArrowLeft className="h-7 w-7 drop-shadow-lg" aria-hidden />
        </button>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold leading-tight text-white drop-shadow-lg sm:text-xl">
            {item.title}
          </h2>
          {isTv && (
            <p className="mt-0.5 truncate text-[13px] text-white/75 drop-shadow">
              S{display.season}:E{display.episode}
              {currentEpisodeName ? ` · ${currentEpisodeName}` : ""}
            </p>
          )}
        </div>
      </div>

      {/* ---------- Bottom controls ---------- */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-10 transition-opacity duration-300",
          controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      >
        <div className="px-4 pb-4 md:px-8 md:pb-6">
          {/* Progress bar */}
          <div
            role="slider"
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.floor(duration) || 0}
            aria-valuenow={Math.floor(
              drag.active ? drag.ratio * duration : time
            )}
            aria-valuetext={`${fmt(
              drag.active ? drag.ratio * duration : time
            )} of ${fmt(duration)}`}
            tabIndex={0}
            onPointerDown={onTrackDown}
            onPointerMove={onTrackMove}
            onPointerUp={onTrackUp}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") {
                e.preventDefault();
                seekBy(-10);
              } else if (e.key === "ArrowRight") {
                e.preventDefault();
                seekBy(10);
              }
            }}
            className="group/track relative flex h-6 cursor-pointer items-center"
          >
            <div className="relative h-[4px] w-full rounded-full bg-white/30 transition-all group-hover/track:h-[6px]">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-[#e50914]"
                style={{ width: `${shownRatio * 100}%` }}
              />
              <div
                className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#e50914] opacity-0 shadow-lg transition-opacity group-hover/track:opacity-100"
                style={{ left: `${shownRatio * 100}%` }}
              />
            </div>
          </div>

          {/* Control buttons */}
          <div className="mt-1.5 flex items-center gap-3 text-white md:gap-4">
            <button
              type="button"
              aria-label={playing ? "Pause" : "Play"}
              onClick={togglePlay}
              className="transition-transform hover:scale-110"
            >
              {playing ? (
                <Pause className="h-8 w-8 fill-current" aria-hidden />
              ) : (
                <Play className="h-8 w-8 fill-current" aria-hidden />
              )}
            </button>

            <button
              type="button"
              aria-label="Back 10 seconds"
              onClick={() => seekBy(-10)}
              className="transition-transform hover:scale-110"
            >
              <span className="relative flex h-8 w-8 items-center justify-center">
                <RotateCcw className="h-8 w-8" aria-hidden />
                <span className="absolute text-[7px] font-black">10</span>
              </span>
            </button>

            <button
              type="button"
              aria-label="Forward 10 seconds"
              onClick={() => seekBy(10)}
              className="transition-transform hover:scale-110"
            >
              <span className="relative flex h-8 w-8 items-center justify-center">
                <RotateCw className="h-8 w-8" aria-hidden />
                <span className="absolute text-[7px] font-black">10</span>
              </span>
            </button>

            {/* Volume */}
            <div className="group/vol flex items-center gap-2">
              <button
                type="button"
                aria-label={muted ? "Unmute" : "Mute"}
                onClick={toggleMute}
                className="transition-transform hover:scale-110"
              >
                {muted || volume === 0 ? (
                  <VolumeX className="h-7 w-7" aria-hidden />
                ) : volume < 0.5 ? (
                  <Volume1 className="h-7 w-7" aria-hidden />
                ) : (
                  <Volume2 className="h-7 w-7" aria-hidden />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={(e) => changeVolume(Number(e.target.value))}
                aria-label="Volume"
                className="hidden h-1 w-0 cursor-pointer accent-[#e50914] transition-all duration-200 group-hover/vol:w-16 sm:block sm:w-16 md:group-hover/vol:w-20"
              />
            </div>

            <span className="ml-1 text-[13px] font-medium tabular-nums text-white/90 md:text-[14px]">
              {fmt(drag.active ? drag.ratio * duration : time)}{" "}
              <span className="text-white/50">/ {fmt(duration)}</span>
            </span>

            <div className="flex-1" />

            {isTv && hasNextEpisode && (
              <button
                type="button"
                onClick={goNext}
                aria-label="Next episode"
                className="flex items-center gap-2 rounded-[4px] px-2 py-1 text-[13px] font-semibold text-white transition-colors hover:text-white/70"
              >
                <SkipForward className="h-6 w-6 fill-current" aria-hidden />
                <span className="hidden sm:inline">Next Episode</span>
              </button>
            )}

            {isTv && (
              <button
                type="button"
                onClick={() => setEpisodesOpen((o) => !o)}
                aria-label="Episodes"
                aria-expanded={episodesOpen}
                className="transition-transform hover:scale-110"
              >
                <ListVideo className="h-7 w-7" aria-hidden />
              </button>
            )}

            <button
              type="button"
              onClick={cycleRate}
              aria-label={`Playback speed ${rate}x`}
              className="min-w-[36px] text-[13px] font-bold tabular-nums transition-transform hover:scale-110"
            >
              {rate}x
            </button>

            <button
              type="button"
              aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
              onClick={toggleFullscreen}
              className="transition-transform hover:scale-110"
            >
              {fullscreen ? (
                <Minimize className="h-7 w-7" aria-hidden />
              ) : (
                <Maximize className="h-7 w-7" aria-hidden />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ---------- Episode picker ---------- */}
      <AnimatePresence>
        {isTv && episodesOpen && (
          <EpisodePicker
            key={display.season * 1000 + display.episode}
            showId={item.id}
            currentSeason={display.season}
            currentEpisode={display.episode}
            seasonsList={seasonsList}
            onPick={(s, e) => goToEpisode(s, e)}
            onClose={() => setEpisodesOpen(false)}
          />
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}

// ============================================================
// Episode picker — slide-over panel with season select
// ============================================================
function EpisodePicker({
  showId,
  currentSeason,
  currentEpisode,
  seasonsList,
  onPick,
  onClose,
}: {
  showId: number;
  currentSeason: number;
  currentEpisode: number;
  seasonsList: { number: number; name: string; episodeCount: number }[];
  onPick: (season: number, episode: number) => void;
  onClose: () => void;
}) {
  const [season, setSeason] = useState(currentSeason);

  const epsQ = useQuery({
    queryKey: ["season", showId, season],
    queryFn: () => fetchSeason(showId, season),
    staleTime: 600_000,
  });
  const episodes: Episode[] = epsQ.data || [];

  // Fall back to a single-season list when TMDB has no season metadata
  const options =
    seasonsList.length > 0
      ? seasonsList
      : episodes.length > 0
        ? [
            {
              number: season,
              name: `Season ${season}`,
              episodeCount: episodes.length,
            },
          ]
        : [{ number: season, name: `Season ${season}`, episodeCount: 0 }];

  return (
    <motion.aside
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "tween", duration: 0.25, ease: "easeOut" }}
      aria-label="Episodes"
      className="absolute bottom-0 right-0 top-0 z-30 flex w-[min(92vw,420px)] flex-col border-l border-white/10 bg-[#141414]/97 backdrop-blur-sm"
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3.5">
        <h3 className="text-[16px] font-bold text-white">Episodes</h3>
        <div className="flex items-center gap-2">
          <select
            aria-label="Select season"
            value={season}
            onChange={(e) => setSeason(Number(e.target.value))}
            className="rounded-[4px] border border-white/20 bg-[#242424] px-2.5 py-1.5 text-[13px] text-white outline-none"
          >
            {options.map((s) => (
              <option key={s.number} value={s.number}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label="Close episodes"
            onClick={onClose}
            className="rounded-[4px] px-2 py-1 text-[15px] text-white/70 transition-colors hover:text-white"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="styled-scrollbar flex-1 overflow-y-auto">
        {epsQ.isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-[#e50914]" aria-hidden />
          </div>
        ) : episodes.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-[#777]">
            No episode list for this season.
          </p>
        ) : (
          episodes.map((ep) => {
            const active =
              ep.season === currentSeason && ep.number === currentEpisode;
            return (
              <button
                key={ep.id}
                type="button"
                onClick={() => onPick(ep.season, ep.number)}
                className={cn(
                  "flex w-full items-start gap-3 border-b border-white/5 px-4 py-3 text-left transition-colors",
                  active ? "bg-white/10" : "hover:bg-white/5"
                )}
              >
                <span
                  className={cn(
                    "w-7 shrink-0 pt-0.5 text-center text-[16px] font-semibold",
                    active ? "text-[#e50914]" : "text-[#777]"
                  )}
                >
                  {ep.number}
                </span>
                <span className="relative h-[54px] w-[96px] shrink-0 overflow-hidden rounded-[3px] bg-[#242424]">
                  {ep.still ? (
                    <img
                      src={stillUrl(ep.still)}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                    <Play className="h-5 w-5 fill-current text-white" aria-hidden />
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "line-clamp-1 text-[13.5px] font-semibold",
                        active ? "text-white" : "text-[#e5e5e5]"
                      )}
                    >
                      {ep.name}
                    </span>
                    <span className="shrink-0 text-[11px] text-[#777]">
                      {ep.runtime ? `${ep.runtime}m` : ""}
                    </span>
                  </span>
                  {active && (
                    <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-[#e50914]">
                      Now Playing
                    </span>
                  )}
                  <span className="mt-0.5 line-clamp-2 block text-[12px] leading-snug text-[#b3b3b3]">
                    {ep.overview || "No description available."}
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </motion.aside>
  );
}
