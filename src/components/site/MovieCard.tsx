"use client";

import { useState } from "react";
import { Plus, Check, Play, Film } from "lucide-react";
import { cn } from "@/lib/utils";
import { posterUrl, backdropUrl, matchPercent } from "@/lib/api";
import type { MediaItem } from "@/lib/types";

interface MovieCardProps {
  item: MediaItem;
  inList?: boolean;
  onToggleList?: (item: MediaItem) => void;
  onOpen?: (item: MediaItem) => void;
  /** Start playback (falls back to opening the detail modal) */
  onPlay?: (item: MediaItem) => void;
  className?: string;
  /** "poster" = vertical 2:3 card (default everywhere), "landscape" = 16:9 */
  orientation?: "landscape" | "poster";
  /** "row" = hover overlay inside the card (sliders clip overflow);
     "grid" = full Netflix expanded hover card */
  context?: "row" | "grid";
  /** Show a title caption below the thumb (grid pages) */
  caption?: boolean;
  /** Fill the grid cell instead of a fixed slider width */
  fluid?: boolean;
  /** Resume position 0-1 — renders the red progress bar (Continue Watching) */
  progress?: number;
}

function matchLabel(rating: number | null) {
  const m = matchPercent(rating);
  return m ? `${m}% Match` : null;
}

/**
 * Netflix-style card. Vertical poster art everywhere (rows, grids,
 * top-10); hovering expands with play/add controls + match %.
 */
export function MovieCard({
  item,
  inList,
  onToggleList,
  onOpen,
  onPlay,
  className,
  orientation = "poster",
  context = "row",
  caption = false,
  fluid = false,
  progress,
}: MovieCardProps) {
  const [imgError, setImgError] = useState(false);

  const art =
    orientation === "landscape" ? backdropUrl(item.backdrop, "w500") : posterUrl(item.poster);
  const ratio = orientation === "landscape" ? "aspect-video" : "aspect-[2/3]";
  const match = matchLabel(item.rating);

  const open = () => onOpen?.(item);
  const play = () => (onPlay ? onPlay(item) : onOpen?.(item));

  return (
    <div
      className={cn(
        "group relative shrink-0 cursor-pointer",
        orientation === "landscape"
          ? fluid
            ? "w-full"
            : "w-[160px] sm:w-[185px] md:w-[200px] lg:w-[220px]"
          : fluid
            ? "w-full"
            : "w-[110px] sm:w-[125px] md:w-[135px] lg:w-[150px]",
        className
      )}
    >
      {/* ---------- Thumb ---------- */}
      <div
        className={cn(
          "relative overflow-hidden rounded-[4px] bg-[#222] ring-1 ring-white/10 transition-transform duration-200 ease-out",
          ratio,
          context === "row" && "group-hover:scale-[1.04] group-hover:ring-white/30"
        )}
        onClick={open}
        role="button"
        tabIndex={0}
        aria-label={`${item.title}${item.year ? ` (${item.year})` : ""}`}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            open();
          }
        }}
      >
        {art && !imgError ? (
          <img
            src={art}
            alt=""
            loading="lazy"
            onError={() => setImgError(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-2 text-center">
            <Film className="h-6 w-6 text-[#777]" aria-hidden />
            <span className="line-clamp-3 text-[11px] text-[#999]">{item.title}</span>
          </div>
        )}

        {/* Row hover: info overlay inside the card (sliders clip overflow) */}
        {context === "row" && (
          <div className="absolute inset-0 hidden flex-col justify-end bg-gradient-to-t from-black/90 via-black/40 to-transparent p-2.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 md:flex">
            <p className="line-clamp-1 text-[13px] font-semibold text-white">
              {item.title}
            </p>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-[#b3b3b3]">
              {match && (
                <span className="font-semibold text-[#46d369]">{match}</span>
              )}
              {item.year && <span>{item.year}</span>}
              <span className="border border-white/30 px-1 text-[9px] uppercase">
                HD
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                aria-label={`Play ${item.title}`}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-black transition hover:bg-white/80"
                onClick={(e) => {
                  e.stopPropagation();
                  play();
                }}
              >
                <Play className="h-3.5 w-3.5 translate-x-[1px] fill-current" aria-hidden />
              </button>
              {onToggleList && (
                <button
                  type="button"
                  aria-label={
                    inList ? `Remove ${item.title} from My List` : `Add ${item.title} to My List`
                  }
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full border-2 border-white/50 bg-[#2a2a2a]/80 text-white transition hover:border-white",
                    inList && "border-white bg-white/20"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleList(item);
                  }}
                >
                  {inList ? (
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                  )}
                </button>
              )}
            </div>
          </div>
        )}
        {/* Progress bar (Continue Watching row) */}
        {progress != null && progress > 0 && (
          <div className="absolute inset-x-1 bottom-1 h-[3px] overflow-hidden rounded-full bg-white/30">
            <div
              className="h-full rounded-full bg-[#e50914]"
              style={{ width: `${Math.min(100, Math.round(progress * 100))}%` }}
            />
          </div>
        )}
      </div>

      {/* Grid hover: Netflix expanded card */}
      {context === "grid" && (
        <div className="pointer-events-none absolute left-1/2 top-0 z-30 hidden w-[300px] -translate-x-1/2 -translate-y-[6%] scale-95 opacity-0 transition-all duration-200 ease-out group-hover:pointer-events-auto group-hover:scale-100 group-hover:opacity-100 md:block">
          <div
            className="overflow-hidden rounded-[4px] bg-[#181818] shadow-[0_16px_40px_rgba(0,0,0,0.8)] ring-1 ring-white/10"
            role="button"
            tabIndex={0}
            aria-label={`${item.title}${item.year ? ` (${item.year})` : ""}`}
            onClick={open}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                open();
              }
            }}
          >
            <div className={cn("relative", ratio)}>
              {art && !imgError ? (
                <img src={art} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className={cn("flex h-full w-full items-center justify-center bg-[#222]", ratio)}>
                  <Film className="h-8 w-8 text-[#777]" aria-hidden />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#181818] via-transparent to-transparent" />
            </div>
            <div className="space-y-2 p-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={`Play ${item.title}`}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black transition hover:bg-white/80"
                  onClick={(e) => {
                    e.stopPropagation();
                    play();
                  }}
                >
                  <Play className="h-4 w-4 translate-x-[1px] fill-current" aria-hidden />
                </button>
                {onToggleList && (
                  <button
                    type="button"
                    aria-label={
                      inList ? `Remove ${item.title} from My List` : `Add ${item.title} to My List`
                    }
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full border-2 border-white/50 text-white transition hover:border-white",
                      inList && "border-white bg-white/20"
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleList(item);
                    }}
                  >
                    {inList ? (
                      <Check className="h-4 w-4" aria-hidden />
                    ) : (
                      <Plus className="h-4 w-4" aria-hidden />
                    )}
                  </button>
                )}
                <span className="ml-auto text-[10px] uppercase tracking-wide text-[#b3b3b3]">
                  {item.mediaType === "tv" ? "Series" : "Film"}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[12px]">
                {match && (
                  <span className="font-semibold text-[#46d369]">{match}</span>
                )}
                {item.year && <span className="text-[#b3b3b3]">{item.year}</span>}
                <span className="border border-white/40 px-1 text-[10px] text-[#b3b3b3]">
                  HD
                </span>
              </div>
              <p className="line-clamp-1 text-[13px] font-semibold text-white">
                {item.title}
              </p>
              <p className="line-clamp-3 text-[12px] leading-snug text-[#b3b3b3]">
                {item.overview}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Caption below thumb (optional) */}
      {caption && (
        <div className="mt-1.5 space-y-0.5">
          <p className="line-clamp-1 text-[13px] text-[#e5e5e5]">{item.title}</p>
          <p className="text-[11px] text-[#777]">
            {item.year ?? ""}
            {item.year && item.mediaType ? " · " : ""}
            {item.mediaType === "tv" ? "Series" : "Film"}
          </p>
        </div>
      )}
    </div>
  );
}

/** Free archive.org films — vertical card using the archive thumbnail */
export function FreeMovieCard({
  movie,
  onPlay,
  className,
  fluid = false,
}: {
  movie: { identifier: string; title: string; year: number | null; description: string };
  onPlay?: (identifier: string) => void;
  className?: string;
  fluid?: boolean;
}) {
  const [imgError, setImgError] = useState(false);
  return (
    <div
      className={cn(
        "group relative shrink-0 cursor-pointer",
        fluid ? "w-full" : "w-[110px] sm:w-[125px] md:w-[135px] lg:w-[150px]",
        className
      )}
      onClick={() => onPlay?.(movie.identifier)}
      role="button"
      tabIndex={0}
      aria-label={`Play ${movie.title}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPlay?.(movie.identifier);
        }
      }}
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-[4px] bg-[#222] ring-1 ring-white/10 transition-transform duration-200 group-hover:scale-[1.04] group-hover:ring-white/30">
        {!imgError ? (
          <img
            src={`https://archive.org/services/img/${movie.identifier}`}
            alt=""
            loading="lazy"
            onError={() => setImgError(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          /* Title-card fallback when the thumbnail can't load */
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-[#2a2a2a] via-[#222] to-[#161616] p-3 text-center">
            <Film className="h-5 w-5 text-[#666]" aria-hidden />
            <span className="line-clamp-2 text-[13px] font-semibold text-[#e5e5e5]">
              {movie.title}
            </span>
            <span className="text-[11px] text-[#777]">
              {movie.year ? String(movie.year) : "Classic"}
            </span>
          </div>
        )}

        {/* Play overlay on hover */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-black">
            <Play className="h-5 w-5 translate-x-[1px] fill-current" aria-hidden />
          </span>
        </div>

        {/* Free tag */}
        <span className="absolute left-1.5 top-1.5 rounded-[2px] bg-[#e50914] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
          Free
        </span>
      </div>
      <div className="mt-1.5 space-y-0.5">
        <p className="line-clamp-1 text-[13px] text-[#e5e5e5]">{movie.title}</p>
        <p className="text-[11px] text-[#777]">
          {movie.year ? String(movie.year) : "Classic"} · Public domain
        </p>
      </div>
    </div>
  );
}
