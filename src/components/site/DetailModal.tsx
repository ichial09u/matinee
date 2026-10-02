"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Play,
  Plus,
  Check,
  ThumbsUp,
  Loader2,
} from "lucide-react";
import {
  fetchDetails,
  fetchSeason,
  posterUrl,
  backdropUrl,
  logoUrl,
  matchPercent,
  stillUrl,
} from "@/lib/api";
import { getProgress } from "@/lib/progress";
import type { MediaItem, MediaDetail } from "@/lib/types";
import { cn } from "@/lib/utils";

interface DetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: MediaItem | null;
  onOpenMedia?: (item: MediaItem) => void;
  onToggleList?: (item: MediaItem) => void;
  isInList?: (id: number, type: string) => boolean;
  /** Start playback — TV items may pass a season/episode */
  onPlay?: (item: MediaItem, opts?: { season?: number; episode?: number }) => void;
}

/* ---------- Shared bits ---------- */

function MetaRow({
  match,
  year,
  certification,
  runtime,
  seasons,
}: {
  match: string | null;
  year: string | null | undefined;
  certification: string | null | undefined;
  runtime?: number | null;
  seasons?: number | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[14px]">
      {match && (
        <span className="font-semibold text-[#46d369]">{match}</span>
      )}
      {year ? <span className="text-[#b3b3b3]">{year}</span> : null}
      {certification ? (
        <span className="border border-white/40 px-1.5 text-[12px] text-[#d2d2d2]">
          {certification}
        </span>
      ) : null}
      {runtime ? (
        <span className="text-[#b3b3b3]">
          {Math.floor(runtime / 60) > 0 && `${Math.floor(runtime / 60)}h `}
          {runtime % 60}m
        </span>
      ) : null}
      {seasons ? (
        <span className="text-[#b3b3b3]">
          {seasons} Season{seasons > 1 ? "s" : ""}
        </span>
      ) : null}
      <span className="border border-white/40 px-1.5 text-[12px] text-[#d2d2d2]">HD</span>
    </div>
  );
}

function CircleButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-full border-2 bg-[#2a2a2a]/70 text-white transition-colors hover:border-white",
        active ? "border-white bg-white/20" : "border-white/50"
      )}
    >
      {children}
    </button>
  );
}

/** Static artwork hero for the detail modal — backdrop image with a
 * poster fallback. No third-party video embeds (they break on mobile and
 * spawn pop-ups), just key art with the title and action buttons. */
function KeyArtStage({
  art,
  artFallback,
  title,
  logo,
  certification,
  inList,
  onToggleList,
  onPlay,
}: {
  art: string | null;
  artFallback?: string;
  title: string;
  logo: string | null;
  certification: string | null | undefined;
  inList: boolean;
  onToggleList?: () => void;
  onPlay?: () => void;
}) {
  const [liked, setLiked] = useState(false);
  // Artwork fallback chain: backdrop → poster → gradient
  // (component is keyed per media, so the initial value never goes stale)
  const [artSrc, setArtSrc] = useState<string | null>(art || null);

  return (
    <div className="relative aspect-video w-full overflow-hidden bg-black">
      {artSrc ? (
        <img
          src={artSrc}
          alt=""
          className="h-full w-full object-cover"
          onError={() => {
            if (artFallback && artSrc !== artFallback) {
              setArtSrc(artFallback);
            } else {
              setArtSrc(null);
            }
          }}
        />
      ) : (
        <div className="h-full w-full bg-gradient-to-br from-[#2a2a2a] to-[#181818]" />
      )}

      {/* Fade into the modal body */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#181818] via-transparent to-transparent" />

      {/* Title + controls over the fade */}
      <div className="absolute bottom-0 left-0 right-0 p-[3.5vw]">
        {logo ? (
          <img
            src={logo}
            alt={title}
            className="mb-4 h-auto max-h-[86px] w-auto max-w-[55%] drop-shadow-lg"
          />
        ) : (
          <h2 className="mb-4 max-w-[80%] text-2xl font-bold text-white drop-shadow-lg sm:text-3xl">
            {title}
          </h2>
        )}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onPlay}
            className="inline-flex items-center gap-2 rounded-[4px] bg-white px-6 py-1.5 text-[15px] font-bold text-black transition-colors hover:bg-white/75"
          >
            <Play className="h-5 w-5 fill-current" aria-hidden />
            Play
          </button>
          <CircleButton
            label={inList ? "Remove from My List" : "Add to My List"}
            active={inList}
            onClick={onToggleList}
          >
            {inList ? <Check className="h-5 w-5" aria-hidden /> : <Plus className="h-5 w-5" aria-hidden />}
          </CircleButton>
          <CircleButton label="I like this" active={liked} onClick={() => setLiked((l) => !l)}>
            <ThumbsUp className="h-4.5 w-4.5" aria-hidden />
          </CircleButton>
          {certification && (
            <span className="ml-1 border border-white/40 px-1.5 text-[12px] text-[#d2d2d2]">
              {certification}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- TV episodes (TMDB) ---------- */
function EpisodeList({
  showId,
  seasonsList,
  resumeSeason,
  resumeEpisode,
  onPlayEpisode,
}: {
  showId: number;
  seasonsList: { number: number; name: string; episodeCount: number }[];
  resumeSeason?: number;
  resumeEpisode?: number;
  onPlayEpisode: (season: number, episode: number) => void;
}) {
  const [season, setSeason] = useState(
    seasonsList[0]?.number ?? resumeSeason ?? 1
  );

  const epsQ = useQuery({
    queryKey: ["season", showId, season],
    queryFn: () => fetchSeason(showId, season),
    staleTime: 600_000,
  });
  const episodes = epsQ.data || [];

  if (seasonsList.length === 0 && !epsQ.isLoading && episodes.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-[#777]">
        No episode list available for this show.
      </p>
    );
  }

  return (
    <section aria-label="Episodes">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[16px] font-semibold text-white">Episodes</h3>
        {seasonsList.length > 1 && (
          <select
            aria-label="Select season"
            value={season}
            onChange={(e) => setSeason(Number(e.target.value))}
            className="rounded-[4px] border border-white/20 bg-[#242424] px-3 py-1.5 text-[13px] text-white outline-none"
          >
            {seasonsList.map((s) => (
              <option key={s.number} value={s.number}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {epsQ.isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-[#e50914]" aria-hidden />
        </div>
      ) : (
        <div className="styled-scrollbar max-h-[420px] space-y-2 overflow-y-auto pr-1">
          {episodes.map((ep) => {
            const isResume =
              ep.season === resumeSeason && ep.number === resumeEpisode;
            return (
              <button
                key={ep.id}
                type="button"
                onClick={() => onPlayEpisode(ep.season, ep.number)}
                className="flex w-full gap-4 rounded-[4px] bg-[#2f2f2f] p-3 text-left transition-colors hover:bg-[#3a3a3a]"
              >
                <div className="w-8 shrink-0 self-center text-center text-[18px] text-[#777]">
                  {ep.number}
                </div>
                <div className="relative h-[62px] w-[110px] shrink-0 overflow-hidden rounded-[4px] bg-[#3a3a3a]">
                  {ep.still ? (
                    <img
                      src={stillUrl(ep.still)}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity hover:opacity-100">
                    <Play className="h-6 w-6 fill-current text-white" aria-hidden />
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="line-clamp-1 text-[14px] font-medium text-white">
                      {ep.name}
                    </p>
                    <span className="shrink-0 text-[12px] text-[#777]">
                      {ep.runtime ? `${ep.runtime}m` : ep.airDate || ""}
                    </span>
                  </div>
                  {isResume && (
                    <span className="mt-0.5 inline-block rounded-[2px] bg-[#e50914] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                      Continue watching
                    </span>
                  )}
                  <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-[#b3b3b3]">
                    {ep.overview || "No description available."}
                  </p>
                </div>
              </button>
            );
          })}
          {episodes.length === 0 && (
            <p className="py-6 text-center text-sm text-[#777]">
              No episodes listed for this season.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Keyed inner content: remounts whenever the media changes, so all state
 * resets naturally — no sync setState-in-effect needed.
 */
function DetailContent({
  item,
  onOpenMedia,
  onToggleList,
  isInList,
  onPlay,
}: Omit<DetailModalProps, "open" | "onOpenChange">) {
  const [detail, setDetail] = useState<MediaDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (item) {
      fetchDetails(item.id, item.mediaType)
        .then((d) => !cancelled && setDetail(d))
        .catch((e) => !cancelled && setError(e.message))
        .finally(() => !cancelled && setLoading(false));
    }
    return () => {
      cancelled = true;
    };
  }, [item]);

  if (!item) return null;

  const saved = getProgress(item);
  const isTv = item.mediaType === "tv";

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="aspect-video w-full rounded-none" />
        <div className="space-y-3 p-8">
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <DialogTitle>Something went wrong</DialogTitle>
        <p className="mt-3 text-sm text-[#b3b3b3]">{error}</p>
      </div>
    );
  }

  if (!detail) return null;

  const match = matchPercent(detail.rating);
  const seasonsList =
    detail.seasonsList && detail.seasonsList.length > 0
      ? detail.seasonsList
      : [];

  return (
    <div>
      <KeyArtStage
        art={
          detail.backdrop
            ? backdropUrl(detail.backdrop, "w1280")
            : posterUrl(detail.poster, "w780")
        }
        artFallback={posterUrl(detail.poster, "w780")}
        title={detail.title}
        logo={detail.logo ? logoUrl(detail.logo, "w500") : null}
        certification={detail.certification}
        inList={Boolean(isInList?.(item.id, item.mediaType))}
        onToggleList={() => onToggleList?.(item)}
        onPlay={() => onPlay?.(item)}
      />

      <div className="space-y-8 p-4 sm:p-8">
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-[2fr_1fr]">
          <div className="space-y-4">
            <MetaRow
              match={match ? `${match}% Match` : null}
              year={detail.year}
              certification={detail.certification}
              runtime={detail.runtime}
              seasons={isTv ? detail.seasons : undefined}
            />
            <p className="text-[15px] leading-relaxed text-white">
              {detail.overview}
            </p>
            {detail.tagline && (
              <p className="text-[13px] italic text-[#777]">
                &ldquo;{detail.tagline}&rdquo;
              </p>
            )}
          </div>

          <div className="space-y-3 text-[13px]">
            {detail.cast && detail.cast.length > 0 && (
              <p>
                <span className="text-[#777]">Cast: </span>
                <span className="text-white/90">
                  {detail.cast.slice(0, 4).map((c) => c.name).join(", ")}
                  {detail.cast.length > 4 ? ", more" : ""}
                </span>
              </p>
            )}
            {detail.genres && detail.genres.length > 0 && (
              <p>
                <span className="text-[#777]">Genres: </span>
                <span className="text-white/90">
                  {detail.genres.map((g) => g.name).join(", ")}
                </span>
              </p>
            )}
            {isTv && detail.seasons ? (
              <p>
                <span className="text-[#777]">Seasons: </span>
                <span className="text-white/90">
                  {detail.seasons}
                  {detail.episodeCount ? ` (${detail.episodeCount} episodes)` : ""}
                </span>
              </p>
            ) : null}
          </div>
        </div>

        {/* Episodes (TV) */}
        {isTv && (
          <EpisodeList
            key={`eps-${item.id}`}
            showId={item.id}
            seasonsList={seasonsList}
            resumeSeason={saved?.season}
            resumeEpisode={saved?.episode}
            onPlayEpisode={(season, episode) =>
              onPlay?.(item, { season, episode })
            }
          />
        )}

        {/* More Like This — Netflix mini-card grid (vertical posters) */}
        {detail.similar && detail.similar.length > 0 && (
          <section aria-label="More like this">
            <h3 className="mb-4 text-[16px] font-semibold text-white">
              More Like This
            </h3>
            <div className="grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 md:grid-cols-5">
              {detail.similar.slice(0, 10).map((s) => {
                const m = matchPercent(s.rating);
                return (
                  <button
                    key={`${s.mediaType}-${s.id}`}
                    type="button"
                    onClick={() => onOpenMedia?.(s)}
                    className="group overflow-hidden rounded-[4px] bg-[#2f2f2f] text-left transition-colors hover:bg-[#3a3a3a]"
                  >
                    <div className="relative aspect-[2/3] w-full overflow-hidden bg-[#3a3a3a]">
                      {s.poster ? (
                        <img
                          src={posterUrl(s.poster, "w342")}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : s.backdrop ? (
                        <img
                          src={backdropUrl(s.backdrop, "w500")}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full bg-[#3a3a3a]" />
                      )}
                    </div>
                    <div className="space-y-1.5 p-2.5">
                      <div className="flex items-center gap-2 text-[12px]">
                        {m && (
                          <span className="font-semibold text-[#46d369]">
                            {m}% Match
                          </span>
                        )}
                        {s.year && (
                          <span className="text-[#b3b3b3]">{s.year}</span>
                        )}
                        <span className="ml-auto border border-white/30 px-1 text-[10px] text-[#b3b3b3]">
                          HD
                        </span>
                      </div>
                      <p className="line-clamp-1 text-[13px] font-semibold text-white">
                        {s.title}
                      </p>
                      <p className="line-clamp-3 text-[12px] leading-snug text-[#b3b3b3]">
                        {s.overview}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* About */}
        <section aria-label={`About ${detail.title}`}>
          <h3 className="mb-4 text-[16px] font-semibold text-white">
            About <span className="font-bold">{detail.title}</span>
          </h3>
          <div className="max-w-xl space-y-3 text-[13px]">
            {detail.cast && detail.cast.length > 0 && (
              <p>
                <span className="text-[#777]">Cast: </span>
                <span className="text-white/90">
                  {detail.cast.map((c) => c.name).join(", ")}
                </span>
              </p>
            )}
            {detail.genres && detail.genres.length > 0 && (
              <p>
                <span className="text-[#777]">Genres: </span>
                <span className="text-white/90">
                  {detail.genres.map((g) => g.name).join(", ")}
                </span>
              </p>
            )}
            {detail.releaseDate && (
              <p>
                <span className="text-[#777]">Release date: </span>
                <span className="text-white/90">{detail.releaseDate}</span>
              </p>
            )}
            {detail.status && (
              <p>
                <span className="text-[#777]">Status: </span>
                <span className="text-white/90">{detail.status}</span>
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export function DetailModal({
  open,
  onOpenChange,
  item,
  onOpenMedia,
  onToggleList,
  isInList,
  onPlay,
}: DetailModalProps) {
  const contentKey = `tmdb-${item?.mediaType}-${item?.id}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="styled-scrollbar max-h-[92vh] w-[min(96vw,56rem)] overflow-y-auto rounded-lg bg-[#181818] p-0 sm:w-[min(94vw,60rem)]"
      >
        <DialogTitle className="sr-only">
          {item?.title || "Details"}
        </DialogTitle>
        <DetailContent
          key={contentKey}
          item={item}
          onOpenMedia={onOpenMedia}
          onToggleList={onToggleList}
          isInList={isInList}
          onPlay={onPlay}
        />
      </DialogContent>
    </Dialog>
  );
}
