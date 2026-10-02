"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  SkipForward,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Loader2,
  ListVideo,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveStream } from "@/lib/archive";
import { enterImmersive, isPortrait, isTouchDevice } from "@/lib/immersive";

export interface PlayerTrack {
  identifier: string;
  title: string;
  year?: number | null;
}

interface VideoPlayerProps {
  /** Ordered playlist — Next goes to the following track */
  playlist: PlayerTrack[];
  /** Index of the track that should be playing */
  index: number;
  /** Called when the user changes track (keeps player mounted) */
  onIndexChange?: (index: number) => void;
  onClose?: () => void;
  autoPlay?: boolean;
}

function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Custom remote-style video player.
 *
 * Layout (as requested):
 *   ┌──────────────────────────────┐
 *   │           VIDEO              │
 *   ├──────────────────────────────┤
 *   │  [-10s] [Play/Pause] [+10s] … │  ← button row
 *   │  ▓▓▓▓▓░░░░░ 12:34 / 1:52:00  │  ← progress bar BELOW buttons
 *   └──────────────────────────────┘
 *
 * Switching to the next film only swaps the <video> src —
 * the player stays mounted (nothing "disconnects").
 */
export function VideoPlayer({
  playlist,
  index,
  onIndexChange,
  autoPlay = true,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const track = playlist[index];

  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [showList, setShowList] = useState(false);
  const [portraitFallback, setPortraitFallback] = useState(false);
  const autoImmersiveRef = useRef({ done: false, pending: false });

  /**
   * Stream state is keyed by the archive identifier it belongs to.
   * The current track's state is DERIVED below — switching tracks "resets"
   * without any synchronous setState inside an effect.
   */
  const [stream, setStream] = useState<{
    forId: string;
    url: string | null;
    error: string | null;
    resolving: boolean;
  }>({ forId: "", url: null, error: null, resolving: false });

  const active =
    track && stream.forId === track.identifier
      ? stream
      : { url: null as string | null, error: null as string | null, resolving: true };

  const srcUrl = active.url;
  const error = active.error;
  const hasNext = index < playlist.length - 1;

  // ---------- Resolve the stream when the track changes ----------
  useEffect(() => {
    const id = track?.identifier;
    if (!id) return;
    let cancelled = false;

    resolveStream(id)
      .then((res) => {
        if (cancelled) return;
        setStream({
          forId: id,
          url: res?.url ?? null,
          error: res ? null : "No playable video file found for this item.",
          resolving: false,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setStream({
          forId: id,
          url: null,
          error:
            "Could not reach Internet Archive. Check your connection and try again.",
          resolving: false,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [track?.identifier]);

  // ---------- Next track (keeps the same <video> element) ----------
  const goNext = useCallback(() => {
    if (hasNext && onIndexChange) {
      onIndexChange(index + 1);
    }
  }, [hasNext, onIndexChange, index]);

  // ---------- Auto immersive: flip to landscape fullscreen on play ----------
  // Same behavior as the main player: fullscreen + landscape lock
  // right as playback starts, with a CSS-rotate fallback for browsers
  // that can't lock orientation.
  const tryAutoImmersive = useCallback(() => {
    const st = autoImmersiveRef.current;
    if (st.done || st.pending) return;
    st.pending = true;
    enterImmersive(containerRef.current)
      .then((ok) => {
        st.pending = false;
        if (ok) st.done = true;
      })
      .catch(() => {
        st.pending = false;
      });
  }, []);

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

  // ---------- Playback controls ----------
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v || !srcUrl) return;
    tryAutoImmersive(); // fresh gesture — retry the flip if needed
    if (v.paused) v.play().catch(() => undefined);
    else v.pause();
  }, [srcUrl, tryAutoImmersive]);

  const skip = useCallback((delta: number) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration)) return;
    const t = Math.min(Math.max(v.currentTime + delta, 0), v.duration);
    v.currentTime = t;
    setCurrent(t);
  }, []);

  const seekTo = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration)) return;
    const clamped = Math.min(Math.max(t, 0), v.duration);
    v.currentTime = clamped;
    setCurrent(clamped);
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    } else {
      el.requestFullscreen().catch(() => undefined);
    }
  }, []);

  // ---------- Keyboard shortcuts ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          skip(-10);
          break;
        case "ArrowRight":
          e.preventDefault();
          skip(10);
          break;
        case "ArrowUp":
          e.preventDefault();
          setVolume((vol) => {
            const nv = Math.min(1, vol + 0.1);
            if (videoRef.current) videoRef.current.volume = nv;
            return nv;
          });
          break;
        case "ArrowDown":
          e.preventDefault();
          setVolume((vol) => {
            const nv = Math.max(0, vol - 0.1);
            if (videoRef.current) videoRef.current.volume = nv;
            return nv;
          });
          break;
        case "m":
        case "M":
          toggleMute();
          break;
        case "f":
        case "F":
          toggleFullscreen();
          break;
        case "n":
        case "N":
          goNext();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, skip, toggleMute, toggleFullscreen, goNext]);

  // ---------- Fullscreen state sync ----------
  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // ---------- Progress bar seeking (click + drag) ----------
  const seekFromPointer = useCallback(
    (clientX: number) => {
      const bar = barRef.current;
      const v = videoRef.current;
      if (!bar || !v || !Number.isFinite(v.duration)) return;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
      seekTo(ratio * v.duration);
    },
    [seekTo]
  );

  const onBarPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    seekFromPointer(e.clientX);
  };
  const onBarPointerMove = (e: React.PointerEvent) => {
    if (e.buttons === 1) seekFromPointer(e.clientX);
  };

  const playedPct = duration > 0 ? (current / duration) * 100 : 0;
  const bufferedPct = duration > 0 ? (buffered / duration) * 100 : 0;

  // ---------- Render ----------
  return (
    <div
      ref={containerRef}
      className="w-full overflow-hidden rounded-[4px] bg-black ring-1 ring-white/10"
    >
      {/* Inner surface — display:contents normally (zero layout impact).
          When we're fullscreen but the browser can't lock orientation, it
          becomes .force-landscape and rotates the whole player 90°. It has
          to be an inner element: the UA's fullscreen rules pin the
          fullscreen element itself to the screen. */}
      <div
        className={cn(
          "contents",
          fullscreen && portraitFallback && "force-landscape"
        )}
      >
      {/* ---------- Video area ---------- */}
      <div className="relative aspect-video w-full bg-black">
        {error ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="max-w-md text-[14px] leading-relaxed text-[#ff9d9d]">{error}</p>
            <button
              type="button"
              className="rounded-[4px] bg-white px-5 py-2 text-[14px] font-bold text-black hover:bg-white/80"
              onClick={() => {
                const id = track.identifier;
                setStream({ forId: id, url: null, error: null, resolving: true });
                resolveStream(id)
                  .then((res) =>
                    setStream({
                      forId: id,
                      url: res?.url ?? null,
                      error: res ? null : "No playable video file found for this item.",
                      resolving: false,
                    })
                  )
                  .catch(() =>
                    setStream({
                      forId: id,
                      url: null,
                      error: "Still unreachable. The archive may be blocked on this network.",
                      resolving: false,
                    })
                  );
              }}
            >
              Retry
            </button>
          </div>
        ) : !srcUrl ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-[#e50914]" aria-hidden />
            <p className="text-[13px] text-[#b3b3b3]">
              Resolving stream from archive.org…
            </p>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              key={srcUrl}
              src={srcUrl}
              className="h-full w-full bg-black"
              playsInline
              autoPlay={autoPlay}
              preload="auto"
              onClick={togglePlay}
              onPlay={() => {
                setPlaying(true);
                tryAutoImmersive(); // covers autoplay-started playback
              }}
              onPause={() => setPlaying(false)}
              onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
              onDurationChange={(e) => setDuration(e.currentTarget.duration)}
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                v.volume = volume;
                v.muted = muted;
              }}
              onProgress={(e) => {
                const v = e.currentTarget;
                if (v.buffered.length > 0) {
                  setBuffered(v.buffered.end(v.buffered.length - 1));
                }
              }}
              onWaiting={() => setBuffering(true)}
              onPlaying={() => setBuffering(false)}
              onCanPlay={() => setBuffering(false)}
              onError={() =>
                setStream({
                  forId: track.identifier,
                  url: null,
                  error: "The video failed to load. The file may be unavailable.",
                  resolving: false,
                })
              }
              onEnded={goNext}
              aria-label={`Player: ${track.title}`}
            >
              Your browser does not support HTML5 video.
            </video>

            {/* Buffering spinner over video */}
            {(active.resolving || buffering) && !error && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-white/80 drop-shadow" aria-hidden />
              </div>
            )}

            {/* Tap-to-toggle overlay hint (double purpose: pause when clicked) */}
            <button
              type="button"
              aria-label={playing ? "Pause" : "Play"}
              className="absolute inset-0 h-full w-full cursor-pointer"
              onClick={togglePlay}
              tabIndex={-1}
            />
          </>
        )}

        {/* Track info overlay */}
        <div className="pointer-events-none absolute left-0 right-0 top-0 bg-gradient-to-b from-black/70 to-transparent p-3 sm:p-4">
          <p className="text-lg font-bold leading-tight text-white sm:text-xl">
            {track?.title}
            {track?.year ? ` (${track.year})` : ""}
          </p>
          <p className="mt-0.5 text-[11px] text-white/60">
            Internet Archive · Public domain · Track {index + 1} of {playlist.length}
          </p>
        </div>
      </div>

      {/* ============================================================
          CONTROL PANEL — buttons on top, progress bar BELOW buttons
         ============================================================ */}
      <div className="space-y-3 bg-[#181818] p-3 sm:p-4">
        {/* --- Button row --- */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Skip back 10s */}
          <button
            type="button"
            aria-label="Skip back 10 seconds"
            title="Back 10s (←)"
            className="flex h-11 w-11 items-center justify-center rounded-sm text-white transition-colors hover:bg-white/10 hover:text-primary sm:h-12 sm:w-12"
            onClick={() => skip(-10)}
          >
            <div className="flex flex-col items-center leading-none">
              <RotateCcw className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden />
              <span className="text-[9px] font-semibold">10</span>
            </div>
          </button>

          {/* Play / Pause */}
          <button
            type="button"
            aria-label={playing ? "Pause" : "Play"}
            title={playing ? "Pause (Space)" : "Play (Space)"}
            className="flex h-14 w-14 items-center justify-center rounded-sm bg-primary text-primary-foreground transition-colors hover:bg-primary/85 sm:h-16 sm:w-16"
            onClick={togglePlay}
          >
            {playing ? (
              <Pause className="h-7 w-7 fill-current sm:h-8 sm:w-8" aria-hidden />
            ) : (
              <Play className="h-7 w-7 translate-x-0.5 fill-current sm:h-8 sm:w-8" aria-hidden />
            )}
          </button>

          {/* Skip forward 10s */}
          <button
            type="button"
            aria-label="Skip forward 10 seconds"
            title="Forward 10s (→)"
            className="flex h-11 w-11 items-center justify-center rounded-sm text-white transition-colors hover:bg-white/10 hover:text-primary sm:h-12 sm:w-12"
            onClick={() => skip(10)}
          >
            <div className="flex flex-col items-center leading-none">
              <RotateCw className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden />
              <span className="text-[9px] font-semibold">10</span>
            </div>
          </button>

          {/* Next film */}
          <button
            type="button"
            aria-label="Next film"
            title="Next film (N)"
            disabled={!hasNext}
            className={cn(
              "flex h-11 items-center gap-2 rounded-[4px] px-4 text-[13px] font-semibold transition-colors sm:h-12",
              hasNext
                ? "text-white hover:bg-white/10"
                : "cursor-not-allowed text-white/30"
            )}
            onClick={goNext}
          >
            <SkipForward className="h-5 w-5" aria-hidden />
            <span className="hidden sm:inline">Next film</span>
          </button>

          <div className="flex-1" />

          {/* Mute */}
          <button
            type="button"
            aria-label={muted ? "Unmute" : "Mute"}
            title="Mute (M)"
            className="flex h-11 w-11 items-center justify-center rounded-sm text-white transition-colors hover:bg-white/10 sm:h-12 sm:w-12"
            onClick={toggleMute}
          >
            {muted || volume === 0 ? (
              <VolumeX className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden />
            ) : (
              <Volume2 className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden />
            )}
          </button>

          {/* Volume slider */}
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            aria-label="Volume"
            className="h-1.5 w-16 cursor-pointer appearance-none rounded-full bg-white/20 accent-primary sm:w-24"
            onChange={(e) => {
              const val = Number(e.target.value);
              setVolume(val);
              setMuted(val === 0);
              if (videoRef.current) {
                videoRef.current.volume = val;
                videoRef.current.muted = val === 0;
              }
            }}
          />

          {/* Fullscreen */}
          <button
            type="button"
            aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            title="Fullscreen (F)"
            className="flex h-11 w-11 items-center justify-center rounded-sm text-white transition-colors hover:bg-white/10 sm:h-12 sm:w-12"
            onClick={toggleFullscreen}
          >
            {fullscreen ? (
              <Minimize className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden />
            ) : (
              <Maximize className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden />
            )}
          </button>

          {/* Playlist toggle */}
          <button
            type="button"
            aria-label="Toggle playlist"
            title="Playlist"
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-sm text-white transition-colors hover:bg-white/10 sm:h-12 sm:w-12",
              showList && "bg-white/10 text-primary"
            )}
            onClick={() => setShowList((s) => !s)}
          >
            <ListVideo className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden />
          </button>
        </div>

        {/* --- PROGRESS BAR (below the buttons, as requested) --- */}
        <div className="flex items-center gap-3">
          <span className="w-14 shrink-0 text-right font-mono text-[11px] tabular-nums text-white/80">
            {fmtTime(current)}
          </span>

          <div
            ref={barRef}
            role="slider"
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration) || 100}
            aria-valuenow={Math.round(current)}
            tabIndex={0}
            className="group/bar relative h-2.5 flex-1 cursor-pointer touch-none rounded-full"
            onPointerDown={onBarPointerDown}
            onPointerMove={onBarPointerMove}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") seekTo(current - 10);
              if (e.key === "ArrowRight") seekTo(current + 10);
            }}
          >
            {/* Track */}
            <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-white/20" />
            {/* Buffered */}
            <div
              className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-white/30"
              style={{ width: `${bufferedPct}%` }}
            />
            {/* Played */}
            <div
              className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-primary transition-[width] duration-150"
              style={{ width: `${playedPct}%` }}
            />
            {/* Knob */}
            <div
              className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary opacity-0 shadow transition-opacity group-hover/bar:opacity-100"
              style={{ left: `${playedPct}%` }}
            />
          </div>

          <span className="w-14 shrink-0 font-mono text-[11px] tabular-nums text-white/80">
            {fmtTime(duration)}
          </span>
        </div>

        {/* --- Playlist (switch films without leaving the player) --- */}
        {showList && (
          <div
            className="styled-scrollbar max-h-56 space-y-1 overflow-y-auto rounded-[4px] bg-black/25 p-2 ring-1 ring-white/10"
            role="list"
            aria-label="Film queue"
          >
            {playlist.map((t, i) => (
              <button
                key={t.identifier}
                type="button"
                role="listitem"
                className={cn(
                  "flex w-full items-center gap-3 rounded-[4px] px-3 py-2 text-left text-sm transition-colors",
                  i === index
                    ? "bg-white/10 text-white"
                    : "text-white/80 hover:bg-white/10"
                )}
                onClick={() => onIndexChange?.(i)}
              >
                <span className="w-5 shrink-0 text-[11px] tabular-nums text-white/40">
                  {i + 1}
                </span>
                <span className="line-clamp-1 flex-1">
                  {t.title}
                  {t.year ? ` (${t.year})` : ""}
                </span>
                {i === index && (
                  <span className="shrink-0 text-[11px] font-semibold text-[#46d369]">
                    Now
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
