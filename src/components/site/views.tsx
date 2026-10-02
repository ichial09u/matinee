"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
  Search as SearchIcon,
  ChevronLeft,
  ChevronRight,
  WifiOff,
  Tv,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  discoverMedia,
  fetchGenres,
  fetchList,
  searchMedia,
  fetchFreeMovies,
} from "@/lib/api";
import { searchArchiveMovies } from "@/lib/archive";
import type { MediaItem, FreeMovie } from "@/lib/types";
import { MovieCard, FreeMovieCard } from "./MovieCard";
import { SkeletonRow } from "./Row";
import { VideoPlayer, type PlayerTrack } from "./VideoPlayer";

// ============================================================
// BROWSE (TMDB discover: genre / year / sort) — "Movies"
// ============================================================
const SORTS = [
  { id: "popularity.desc", label: "Most Popular" },
  { id: "vote_average.desc", label: "Highest Rated" },
  { id: "primary_release_date.desc", label: "Newest First" },
  { id: "revenue.desc", label: "Biggest Box Office" },
];

const YEARS = ["", "2026", "2025", "2024", "2023", "2022", "2021", "2020", "2010s", "2000s", "1990s", "1980s"];

export function BrowseView({
  onOpen,
  onPlay,
  isInList,
  onToggleList,
}: {
  onOpen: (item: MediaItem) => void;
  onPlay: (item: MediaItem) => void;
  isInList: (id: number, type: string) => boolean;
  onToggleList: (item: MediaItem) => void;
}) {
  const [genre, setGenre] = useState("");
  const [year, setYear] = useState("");
  const [sort, setSort] = useState("popularity.desc");
  const [page, setPage] = useState(1);

  const { data: genres } = useQuery({
    queryKey: ["genres", "movie"],
    queryFn: () => fetchGenres("movie"),
    staleTime: 24 * 3600 * 1000,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["discover", genre, year, sort, page],
    queryFn: () => discoverMedia({ genre, year, sort, page }),
  });

  const totalPages = Math.min(data?.totalPages ?? 1, 500);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white sm:text-4xl">Movies</h1>

      {/* Filters */}
      <div className="space-y-3">
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => { setGenre(""); setPage(1); }}
            className={cn(
              "whitespace-nowrap rounded-[4px] border px-3.5 py-1.5 text-[13px] transition-colors",
              !genre
                ? "border-white bg-white font-semibold text-black"
                : "border-white/30 bg-transparent text-[#b3b3b3] hover:border-white/70 hover:text-white"
            )}
          >
            All Genres
          </button>
          {genres?.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => { setGenre(String(g.id)); setPage(1); }}
              className={cn(
                "whitespace-nowrap rounded-[4px] border px-3.5 py-1.5 text-[13px] transition-colors",
                genre === String(g.id)
                  ? "border-white bg-white font-semibold text-black"
                  : "border-white/30 bg-transparent text-[#b3b3b3] hover:border-white/70 hover:text-white"
              )}
            >
              {g.name}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Sort by"
            value={sort}
            onChange={(e) => { setSort(e.target.value); setPage(1); }}
            className="h-9 rounded-[4px] border border-white/20 bg-[#242424] px-2.5 text-[13px] text-white outline-none"
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
          <select
            aria-label="Filter by year"
            value={year}
            onChange={(e) => { setYear(e.target.value); setPage(1); }}
            className="h-9 rounded-[4px] border border-white/20 bg-[#242424] px-2.5 text-[13px] text-white outline-none"
          >
            <option value="">Any Year</option>
            {YEARS.filter(Boolean).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <div className="rounded-[4px] border border-[#e87c03]/50 bg-[#e87c03]/10 p-4">
          <p className="text-[14px] leading-relaxed text-[#ffd2a6]">
            {(error as Error).message}
          </p>
        </div>
      ) : isLoading ? (
        <div className="grid grid-cols-3 gap-x-3 gap-y-8 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {Array.from({ length: 15 }).map((_, i) => (
            <div key={i} className="w-full">
              <div className="aspect-[2/3] animate-pulse rounded-[4px] bg-[#222]" />
              <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-[#222]" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-x-3 gap-y-8 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
            {data?.items.map((m) => (
              <MovieCard
                key={m.id}
                item={m}
                inList={isInList(m.id, m.mediaType)}
                onToggleList={onToggleList}
                onOpen={onOpen}
                onPlay={onPlay}
                context="grid"
                caption
                fluid
              />
            ))}
          </div>
          {data && data.items.length === 0 && (
            <p className="py-16 text-center text-[15px] text-[#777]">
              No matches. Try loosening a filter or two.
            </p>
          )}
          <Pagination page={page} totalPages={totalPages} onPage={setPage} />
        </>
      )}
    </div>
  );
}

// ============================================================
// SEARCH RESULTS (TMDB multi-search)
// ============================================================
export function SearchView({
  query,
  onOpen,
  onPlay,
  isInList,
  onToggleList,
}: {
  query: string;
  onOpen: (item: MediaItem) => void;
  onPlay: (item: MediaItem) => void;
  isInList: (id: number, type: string) => boolean;
  onToggleList: (item: MediaItem) => void;
}) {
  // This component is keyed by `query` in the parent, so page resets on new
  // searches via remount — no reset effect needed.
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useQuery({
    queryKey: ["search", query, page],
    queryFn: () => searchMedia(query, page),
    enabled: Boolean(query),
  });

  // Netflix shows "Explore titles related to" suggestions on empty results
  const { data: suggestions } = useQuery({
    queryKey: ["search-suggestions", query],
    queryFn: () => fetchList("popular", 1),
    enabled: Boolean(query) && Boolean(data && data.items.length === 0),
  });

  const noResults = !isLoading && data && data.items.length === 0;

  return (
    <div className="space-y-8">
      {error ? (
        <div className="rounded-[4px] border border-[#e87c03]/50 bg-[#e87c03]/10 p-4">
          <p className="text-[14px] leading-relaxed text-[#ffd2a6]">
            {(error as Error).message}
          </p>
        </div>
      ) : isLoading ? (
        <div className="grid grid-cols-3 gap-x-3 gap-y-8 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {Array.from({ length: 15 }).map((_, i) => (
            <div key={i} className="w-full">
              <div className="aspect-[2/3] animate-pulse rounded-[4px] bg-[#222]" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {data && data.items.length > 0 && (
            <>
              <h1 className="text-lg text-[#e5e5e5]">
                Search results for <span className="font-semibold text-white">&ldquo;{query}&rdquo;</span>
              </h1>
              <div className="grid grid-cols-3 gap-x-3 gap-y-8 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                {data.items.map((m) => (
                  <MovieCard
                    key={`${m.mediaType}-${m.id}`}
                    item={m}
                    inList={isInList(m.id, m.mediaType)}
                    onToggleList={onToggleList}
                    onOpen={onOpen}
                    onPlay={onPlay}
                    context="grid"
                    caption
                    fluid
                  />
                ))}
              </div>
              <Pagination page={page} totalPages={data.totalPages} onPage={setPage} />
            </>
          )}

          {noResults && (
            <>
              <div className="space-y-2 text-[15px] text-white/90">
                <p>
                  Your search for &ldquo;{query}&rdquo; did not have any matches.
                </p>
                <p className="text-[#b3b3b3]">Suggestions:</p>
                <ul className="ml-5 list-disc space-y-1 text-[#b3b3b3]">
                  <li>Try different keywords</li>
                  <li>Looking for a movie or TV show?</li>
                  <li>Try using a movie, TV show title, an actor or director</li>
                  <li>Try a genre, like comedy, romance, sports, or drama</li>
                </ul>
              </div>
              {suggestions && suggestions.length > 0 && (
                <section aria-label="Explore titles related to your search">
                  <h2 className="mb-4 text-[1.25rem] font-semibold text-[#e5e5e5]">
                    Explore titles related to your search
                  </h2>
                  <div className="grid grid-cols-3 gap-x-3 gap-y-8 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                    {suggestions.slice(0, 10).map((m) => (
                      <MovieCard
                        key={m.id}
                        item={m}
                        inList={isInList(m.id, m.mediaType)}
                        onToggleList={onToggleList}
                        onOpen={onOpen}
                        onPlay={onPlay}
                        context="grid"
                        caption
                        fluid
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================
// TV SHOWS (TMDB) — tabs + genre filter + pagination
// ============================================================
const TV_TABS = [
  { id: "trending", label: "Trending" },
  { id: "popular", label: "Popular" },
  { id: "top_rated", label: "Top Rated" },
  { id: "airing_today", label: "Airing Today" },
];

export function TvView({
  onOpen,
  onPlay,
  isInList,
  onToggleList,
}: {
  onOpen: (item: MediaItem) => void;
  onPlay: (item: MediaItem) => void;
  isInList: (id: number, type: string) => boolean;
  onToggleList: (item: MediaItem) => void;
}) {
  const [tab, setTab] = useState("trending");
  const [genre, setGenre] = useState("");
  const [page, setPage] = useState(1);

  const { data: genres } = useQuery({
    queryKey: ["genres", "tv"],
    queryFn: () => fetchGenres("tv"),
    staleTime: 24 * 3600 * 1000,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["tvview", tab, genre, page],
    queryFn: async (): Promise<{ items: MediaItem[]; totalPages: number }> => {
      if (genre) {
        return discoverMedia({ type: "tv", genre, page, sort: "popularity.desc" });
      }
      const items = await fetchList(tab, page, "tv");
      return { items, totalPages: 100 };
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white sm:text-4xl">TV Shows</h1>
        <p className="mt-1 text-[14px] text-[#777]">
          Binges, one-offs and everything between — pick a show and press play.
        </p>
      </div>

      {/* Tabs */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {TV_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => { setTab(t.id); setGenre(""); setPage(1); }}
            className={cn(
              "whitespace-nowrap rounded-[4px] border px-3.5 py-1.5 text-[13px] transition-colors",
              tab === t.id && !genre
                ? "border-white bg-white font-semibold text-black"
                : "border-white/30 bg-transparent text-[#b3b3b3] hover:border-white/70 hover:text-white"
            )}
          >
            {t.label}
          </button>
        ))}
        <span className="mx-1 my-auto hidden h-5 w-px bg-white/15 sm:block" />
        {genres?.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => { setGenre(String(g.id)); setPage(1); }}
            className={cn(
              "whitespace-nowrap rounded-[4px] border px-3.5 py-1.5 text-[13px] transition-colors",
              genre === String(g.id)
                ? "border-white bg-white font-semibold text-black"
                : "border-white/30 bg-transparent text-[#b3b3b3] hover:border-white/70 hover:text-white"
            )}
          >
            {g.name}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-[4px] border border-[#e87c03]/50 bg-[#e87c03]/10 p-4">
          <p className="text-[14px] leading-relaxed text-[#ffd2a6]">
            {(error as Error).message}
          </p>
        </div>
      ) : isLoading ? (
        <div className="grid grid-cols-3 gap-x-3 gap-y-8 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {Array.from({ length: 15 }).map((_, i) => (
            <div key={i} className="w-full">
              <div className="aspect-[2/3] animate-pulse rounded-[4px] bg-[#222]" />
              <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-[#222]" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-x-3 gap-y-8 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
            {data?.items.map((s) => (
              <MovieCard
                key={s.id}
                item={s}
                inList={isInList(s.id, s.mediaType)}
                onToggleList={onToggleList}
                onOpen={onOpen}
                onPlay={onPlay}
                context="grid"
                caption
                fluid
              />
            ))}
          </div>
          {data && data.items.length === 0 && (
            <p className="py-16 text-center text-[15px] text-[#777]">
              Nothing here right now — try another tab or genre.
            </p>
          )}
          <Pagination page={page} totalPages={Math.min(data?.totalPages ?? 1, 100)} onPage={setPage} />
        </>
      )}
    </div>
  );
}

// ============================================================
// FREE MOVIES (Internet Archive, client-side)
// ============================================================
export function FreeView({
  onPlay,
}: {
  onPlay: (identifier: string, list: FreeMovie[]) => void;
}) {
  const [movies, setMovies] = useState<FreeMovie[]>([]);
  const [descs, setDescs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      let cancelled = false;
      setLoading(true);
      searchArchiveMovies(1, 48, query)
        .then((items) => {
          if (cancelled) return;
          setOffline(false);
          setMovies(items);
          const map: Record<string, string> = {};
          for (const m of items) map[m.identifier] = m.description;
          setDescs(map);
        })
        .catch(async () => {
          if (cancelled) return;
          // Archive unreachable — fall back to the curated catalog
          try {
            const items = await fetchFreeMovies();
            if (cancelled) return;
            setOffline(true);
            setMovies(items);
            const map: Record<string, string> = {};
            for (const m of items) map[m.identifier] = m.description;
            setDescs(map);
          } catch {
            if (!cancelled) setOffline(true);
          }
        })
        .finally(() => !cancelled && setLoading(false));
      return () => { cancelled = true; };
    }, 400);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white sm:text-4xl">Free Movies</h1>
          <p className="mt-1 max-w-xl text-[14px] leading-relaxed text-[#777]">
            Public-domain classics, streamed straight from the Internet Archive.
            No account, no catch — just press play.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#777]" aria-hidden />
          <Input
            placeholder="Search the archive"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="rounded-[4px] border-white/20 bg-[#242424] pl-9 text-[14px] text-white placeholder:text-[#777]"
            aria-label="Search free movies"
          />
        </div>
      </div>

      {offline && (
        <div className="flex items-start gap-3 rounded-[4px] border border-[#e50914]/40 bg-[#e50914]/10 p-4 text-[14px] text-[#ff9d9d]">
          <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p className="leading-relaxed">
            Couldn&apos;t reach archive.org from this network, so the built-in
            shelf of classics is standing in. Playback needs a connection to
            the archive itself.
          </p>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="w-full">
              <div className="aspect-[2/3] animate-pulse rounded-[4px] bg-[#222]" />
              <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-[#222]" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {movies.map((m) => (
            <FreeMovieCard
              key={m.identifier}
              movie={{
                identifier: m.identifier,
                title: m.title,
                year: m.year ?? null,
                description: m.description,
              }}
              onPlay={() => onPlay(m.identifier, movies)}
              fluid
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// MY LIST
// ============================================================
export function ListView({
  list,
  onOpen,
  onPlay,
  isInList,
  onToggleList,
  onNavigate,
}: {
  list: MediaItem[];
  onOpen: (item: MediaItem) => void;
  onPlay: (item: MediaItem) => void;
  isInList: (id: number, type: string) => boolean;
  onToggleList: (item: MediaItem) => void;
  onNavigate: (view: "home" | "free") => void;
}) {
  if (list.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-24 text-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[#222] text-[#777]">
          <Tv className="h-9 w-9" aria-hidden />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">
            Your list is empty
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-[#777]">
            Add movies and shows to your list to watch them later.
            Your list lives in this browser — nowhere else.
          </p>
        </div>
        <Button
          onClick={() => onNavigate("home")}
          className="rounded-[4px] bg-white px-6 text-[15px] font-bold text-black hover:bg-white/80"
        >
          Browse Titles
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white sm:text-4xl">My List</h1>
        <p className="mt-1 text-[13px] text-[#777]">
          {list.length} title{list.length === 1 ? "" : "s"} · saved in this browser
        </p>
      </div>
      <div className="grid grid-cols-3 gap-x-3 gap-y-8 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
        {list.map((m) => (
          <MovieCard
            key={`${m.mediaType}-${m.id}`}
            item={m}
            inList={isInList(m.id, m.mediaType)}
            onToggleList={onToggleList}
            onOpen={onOpen}
            onPlay={onPlay}
            context="grid"
            caption
            fluid
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================
// WATCH (archive.org player view)
// ============================================================
export function WatchView({
  playlist,
  index,
  onIndexChange,
  onBack,
}: {
  playlist: PlayerTrack[];
  index: number;
  onIndexChange: (i: number) => void;
  onBack: () => void;
}) {
  const track = playlist[index];
  const [descMap, setDescMap] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    searchArchiveMovies(1, 48)
      .then((items) => {
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const m of items) map[m.identifier] = m.description;
        setDescMap(map);
      })
      .catch(() => {
        /* description is optional — ignore */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const currentDesc = track ? descMap[track.identifier] || "" : "";

  if (!track) {
    return (
      <div className="py-24 text-center">
        <p className="text-[15px] text-[#777]">Nothing on the reel.</p>
        <Button
          className="mt-4 rounded-[4px] bg-white px-6 font-semibold text-black hover:bg-white/80"
          onClick={onBack}
        >
          ← Back to Free Movies
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold leading-tight text-white sm:text-2xl">
            {track.title}
          </h1>
          <p className="mt-1 text-[13px] text-[#777]">
            {track.year ? `${track.year} · ` : ""}Public domain · Internet Archive
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={onBack}
          className="shrink-0 rounded-[4px] bg-[#2a2a2a] text-white hover:bg-[#3a3a3a]"
        >
          <ChevronLeft className="mr-1 h-4 w-4" aria-hidden />
          Back
        </Button>
      </div>

      {/* The player stays mounted while you switch films — nothing disconnects */}
      <VideoPlayer
        playlist={playlist}
        index={index}
        onIndexChange={onIndexChange}
      />

      {/* Description */}
      {currentDesc && (
        <section aria-label="About this film" className="max-w-3xl">
          <h2 className="mb-2 text-[1.1rem] font-semibold text-white">
            About {track.title}
          </h2>
          <p className="text-[14px] leading-relaxed text-[#b3b3b3]">{currentDesc}</p>
        </section>
      )}

      {/* More like this */}
      <section aria-label="More free films">
        <h2 className="mb-4 text-[1.25rem] font-semibold text-[#e5e5e5]">
          More Like This
        </h2>
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-2">
          {playlist
            .filter((_, i) => i !== index)
            .slice(0, 16)
            .map((m) => (
              <FreeMovieCard
                key={m.identifier}
                movie={{ identifier: m.identifier, title: m.title, year: m.year ?? null, description: "" }}
                onPlay={() => {
                  const i = playlist.findIndex((p) => p.identifier === m.identifier);
                  if (i >= 0) onIndexChange(i);
                }}
              />
            ))}
        </div>
      </section>
    </div>
  );
}

// ============================================================
// Shared small components
// ============================================================
export function Pagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 pt-2">
      <Button
        variant="secondary"
        size="sm"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        className="rounded-[4px] bg-[#2a2a2a] text-white hover:bg-[#3a3a3a]"
      >
        <ChevronLeft className="mr-1 h-4 w-4" aria-hidden />
        Previous
      </Button>
      <span className="text-[13px] text-[#777] tabular-nums">
        Page {page} of {totalPages}
      </span>
      <Button
        variant="secondary"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
        className="rounded-[4px] bg-[#2a2a2a] text-white hover:bg-[#3a3a3a]"
      >
        Next
        <ChevronRight className="ml-1 h-4 w-4" aria-hidden />
      </Button>
    </div>
  );
}

export function SectionSkeleton({ label }: { label: string }) {
  return <SkeletonRow label={label} />;
}

export function LoadingScreen() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-[#e50914]" aria-hidden />
    </div>
  );
}
