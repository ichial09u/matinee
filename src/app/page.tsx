"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { fetchList } from "@/lib/api";
import {
  listProgress,
  removeProgress,
  getProgress,
  type ProgressEntry,
} from "@/lib/progress";
import type { MediaItem } from "@/lib/types";
import { isUnreleased, prettyDate } from "@/lib/release";
import { Header, type ViewName } from "@/components/site/Header";
import { Hero } from "@/components/site/Hero";
import { MovieCard } from "@/components/site/MovieCard";
import { Row, Top10Row, SkeletonRow } from "@/components/site/Row";
import { DetailModal } from "@/components/site/DetailModal";
import { PlayerView, type PlayTarget } from "@/components/site/PlayerView";
import {
  BrowseView,
  SearchView,
  TvView,
  ListView,
} from "@/components/site/views";

const LIST_STORAGE = "moviebox_my_list";

export default function Page() {
  const qc = useMemo(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, staleTime: 300_000 } },
      }),
    []
  );
  return (
    <QueryClientProvider client={qc}>
      <MovieApp />
    </QueryClientProvider>
  );
}

function MovieApp() {
  const { toast } = useToast();

  // ---------- Global state ----------
  const [view, setView] = useState<ViewName>("home");
  const [searchQuery, setSearchQuery] = useState("");

  // Detail modal
  const [detailItem, setDetailItem] = useState<MediaItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // My List (localStorage)
  const [myList, setMyList] = useState<MediaItem[]>([]);

  // Continue Watching (localStorage)
  const [continueList, setContinueList] = useState<ProgressEntry[]>([]);

  // Player (full-screen cinesrc overlay)
  const [playTarget, setPlayTarget] = useState<PlayTarget | null>(null);

  // ---------- Boot: restore saved state ----------
  useEffect(() => {
    // Read localStorage in a microtask callback (external system → state)
    queueMicrotask(() => {
      try {
        const stored = JSON.parse(localStorage.getItem(LIST_STORAGE) || "[]");
        if (Array.isArray(stored)) setMyList(stored);
      } catch {
        /* ignore */
      }
      setContinueList(listProgress());
    });
  }, []);

  // Refresh the Continue Watching row after the player closes
  // (PlayerView saves its final position while unmounting, which runs
  // before this effect)
  const wasPlayingRef = useRef(false);
  useEffect(() => {
    if (playTarget) {
      wasPlayingRef.current = true;
      return;
    }
    if (wasPlayingRef.current) {
      wasPlayingRef.current = false;
      queueMicrotask(() => setContinueList(listProgress()));
    }
  }, [playTarget]);

  const persistList = useCallback((list: MediaItem[]) => {
    setMyList(list);
    try {
      localStorage.setItem(LIST_STORAGE, JSON.stringify(list));
    } catch {
      /* ignore */
    }
  }, []);

  const isInList = useCallback(
    (id: number, type: string) =>
      myList.some((m) => m.id === id && m.mediaType === type),
    [myList]
  );

  const toggleList = useCallback(
    (item: MediaItem) => {
      const exists = myList.some(
        (m) => m.id === item.id && m.mediaType === item.mediaType
      );
      if (exists) {
        persistList(myList.filter((m) => !(m.id === item.id && m.mediaType === item.mediaType)));
        toast({ title: "Removed from My List" });
      } else {
        persistList([...myList, item]);
        toast({ title: `Added “${item.title}” to My List` });
      }
    },
    [myList, persistList, toast]
  );

  // ---------- Playback (cinesrc.st) ----------
  const playMedia = useCallback(
    (item: MediaItem, opts?: { season?: number; episode?: number }) => {
      // Unreleased titles can't be on CineSrc yet — no stream to play
      if (isUnreleased(item.releaseDate)) {
        toast({
          title: `${item.title} isn't out yet`,
          description: `Premieres ${prettyDate(item.releaseDate)} — check back then.`,
        });
        return;
      }
      if (item.mediaType === "tv") {
        const saved = getProgress(item);
        const season = opts?.season ?? saved?.season ?? 1;
        const episode = opts?.episode ?? saved?.episode ?? 1;
        setPlayTarget({ kind: "tv", item, season, episode });
      } else {
        setPlayTarget({ kind: "movie", item });
      }
      setDetailOpen(false);
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    },
    [toast]
  );

  const closePlayer = useCallback(() => setPlayTarget(null), []);

  const removeFromContinue = useCallback(
    (key: string) => {
      removeProgress(key);
      setContinueList(listProgress());
      toast({ title: "Removed from Continue Watching" });
    },
    [toast]
  );

  // ---------- Detail modal ----------
  const openDetail = useCallback((item: MediaItem) => {
    setDetailItem(item);
    setDetailOpen(true);
  }, []);

  // ---------- Navigation ----------
  const navigate = useCallback((v: ViewName) => {
    setView(v);
    if (v !== "search") setSearchQuery("");
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, []);

  const doSearch = useCallback((q: string) => {
    setSearchQuery(q);
    setView("search");
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, []);

  // ---------- Home queries ----------
  const onHome = view === "home";

  const trendingQ = useQuery({
    queryKey: ["list", "trending", 1],
    queryFn: () => fetchList("trending", 1),
    enabled: onHome,
  });
  const popularQ = useQuery({
    queryKey: ["list", "popular", 1],
    queryFn: () => fetchList("popular", 1),
    enabled: onHome,
  });
  const topRatedQ = useQuery({
    queryKey: ["list", "top_rated", 1],
    queryFn: () => fetchList("top_rated", 1),
    enabled: onHome,
  });
  const nowPlayingQ = useQuery({
    queryKey: ["list", "now_playing", 1],
    queryFn: () => fetchList("now_playing", 1),
    enabled: onHome,
  });
  const upcomingQ = useQuery({
    queryKey: ["list", "upcoming", 1],
    queryFn: () => fetchList("upcoming", 1),
    enabled: onHome,
  });
  const trendingTvQ = useQuery({
    queryKey: ["list", "trending", 1, "tv"],
    queryFn: () => fetchList("trending", 1, "tv"),
    enabled: onHome,
  });

  return (
    <div className="flex min-h-screen flex-col pb-14 md:pb-0">
      <Header
        view={view}
        onNavigate={navigate}
        onSearch={doSearch}
        listCount={myList.length}
      />

      <main className="flex-1">
        {view === "home" && (
          <div className="space-y-8 md:space-y-12">
            {trendingQ.data && trendingQ.data.length > 0 ? (
              <Hero items={trendingQ.data} onPlay={playMedia} onMoreInfo={openDetail} />
            ) : (
              <div className="h-[68vh] min-h-[480px] w-full animate-pulse bg-[#1d1d1d] sm:h-[56.25vw] sm:max-h-[85vh]" />
            )}

            {trendingQ.error && (
              <div className="px-4 md:px-[3.5vw]">
                <p className="rounded-[4px] border border-[#e87c03]/50 bg-[#e87c03]/10 p-4 text-[14px] leading-relaxed text-[#ffd2a6]">
                  {(trendingQ.error as Error).message}
                </p>
              </div>
            )}

            {/* Continue Watching */}
            {continueList.length > 0 && (
              <Row title="Continue Watching for You">
                {continueList.map((p) => (
                  <ContinueCard
                    key={p.key}
                    entry={p}
                    onResume={() => playMedia(p.item)}
                    onRemove={() => removeFromContinue(p.key)}
                  />
                ))}
              </Row>
            )}

            {(trendingQ.isLoading || !trendingQ.data) && <SkeletonRow label="Trending" />}
            {trendingQ.data && trendingQ.data.length > 0 && (
              <Row title="Trending Now">
                {trendingQ.data.map((m) => (
                  <MovieCard
                    key={m.id}
                    item={m}
                    inList={isInList(m.id, m.mediaType)}
                    onToggleList={toggleList}
                    onOpen={openDetail}
                    onPlay={playMedia}
                  />
                ))}
              </Row>
            )}

            {trendingQ.data && trendingQ.data.length > 0 && (
              <Top10Row title="Top 10 Movies Today">
                {trendingQ.data.slice(0, 10).map((m) => (
                  <MovieCard
                    key={`top10-${m.id}`}
                    item={m}
                    inList={isInList(m.id, m.mediaType)}
                    onToggleList={toggleList}
                    onOpen={openDetail}
                    onPlay={playMedia}
                    orientation="poster"
                  />
                ))}
              </Top10Row>
            )}

            {/* My List shelf */}
            {myList.length > 0 && (
              <Row
                title="My List"
                action={
                  <button
                    type="button"
                    onClick={() => navigate("list")}
                    className="ml-2 shrink-0 text-[12px] font-semibold text-[#b3b3b3] transition-colors hover:text-white"
                  >
                    See all ›
                  </button>
                }
              >
                {myList.slice(0, 14).map((m) => (
                  <MovieCard
                    key={`ml-${m.mediaType}-${m.id}`}
                    item={m}
                    inList={isInList(m.id, m.mediaType)}
                    onToggleList={toggleList}
                    onOpen={openDetail}
                    onPlay={playMedia}
                  />
                ))}
              </Row>
            )}

            {(popularQ.isLoading || !popularQ.data) && <SkeletonRow label="Popular" />}
            {popularQ.data && popularQ.data.length > 0 && (
              <Row title="Popular on Matinee">
                {popularQ.data.map((m) => (
                  <MovieCard
                    key={m.id}
                    item={m}
                    inList={isInList(m.id, m.mediaType)}
                    onToggleList={toggleList}
                    onOpen={openDetail}
                    onPlay={playMedia}
                  />
                ))}
              </Row>
            )}

            {(trendingTvQ.isLoading || !trendingTvQ.data) && <SkeletonRow label="TV" />}
            {trendingTvQ.data && trendingTvQ.data.length > 0 && (
              <Row
                title="Trending TV Shows"
                action={
                  <button
                    type="button"
                    onClick={() => navigate("tv")}
                    className="ml-2 shrink-0 text-[12px] font-semibold text-[#b3b3b3] transition-colors hover:text-white"
                  >
                    Explore all ›
                  </button>
                }
              >
                {trendingTvQ.data.map((s) => (
                  <MovieCard
                    key={`tv-${s.id}`}
                    item={s}
                    inList={isInList(s.id, s.mediaType)}
                    onToggleList={toggleList}
                    onOpen={openDetail}
                    onPlay={playMedia}
                  />
                ))}
              </Row>
            )}

            {(nowPlayingQ.isLoading || !nowPlayingQ.data) && <SkeletonRow label="In Theaters" />}
            {nowPlayingQ.data && nowPlayingQ.data.length > 0 && (
              <Row title="In Theaters Now">
                {nowPlayingQ.data.map((m) => (
                  <MovieCard
                    key={m.id}
                    item={m}
                    inList={isInList(m.id, m.mediaType)}
                    onToggleList={toggleList}
                    onOpen={openDetail}
                    onPlay={playMedia}
                  />
                ))}
              </Row>
            )}

            {(topRatedQ.isLoading || !topRatedQ.data) && <SkeletonRow label="Top Rated" />}
            {topRatedQ.data && topRatedQ.data.length > 0 && (
              <Row title="Award-Winning Films">
                {topRatedQ.data.map((m) => (
                  <MovieCard
                    key={m.id}
                    item={m}
                    inList={isInList(m.id, m.mediaType)}
                    onToggleList={toggleList}
                    onOpen={openDetail}
                    onPlay={playMedia}
                  />
                ))}
              </Row>
            )}

            {(upcomingQ.isLoading || !upcomingQ.data) && <SkeletonRow label="Coming Soon" />}
            {upcomingQ.data && upcomingQ.data.length > 0 && (
              <Row title="Coming Soon">
                {upcomingQ.data.map((m) => (
                  <MovieCard
                    key={m.id}
                    item={m}
                    inList={isInList(m.id, m.mediaType)}
                    onToggleList={toggleList}
                    onOpen={openDetail}
                    onPlay={playMedia}
                  />
                ))}
              </Row>
            )}
          </div>
        )}

        {/* Non-home views: padded container under the fixed header */}
        {view !== "home" && (
          <div className="mx-auto w-full max-w-[1280px] px-4 pb-16 pt-20 md:px-[3.5vw] md:pt-24">
            {view === "browse" && (
              <BrowseView
                onOpen={openDetail}
                onPlay={playMedia}
                isInList={isInList}
                onToggleList={toggleList}
              />
            )}

            {view === "tv" && (
              <TvView
                onOpen={openDetail}
                onPlay={playMedia}
                isInList={isInList}
                onToggleList={toggleList}
              />
            )}

            {view === "search" && (
              <SearchView
                key={searchQuery}
                query={searchQuery}
                onOpen={openDetail}
                onPlay={playMedia}
                isInList={isInList}
                onToggleList={toggleList}
              />
            )}

            {view === "list" && (
              <ListView
                list={myList}
                onOpen={openDetail}
                onPlay={playMedia}
                isInList={isInList}
                onToggleList={toggleList}
                onNavigate={navigate}
              />
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-8 bg-[#141414]">
        <div className="mx-auto max-w-[1000px] px-4 py-10 text-[13px] text-[#808080] md:px-6">
          <p className="mb-6">
            Questions? Everything here runs on public APIs — TMDB for the
            catalog, TVMaze for episode guides, AniList for anime matching,
            and multiple streaming sources you can switch between in the player.
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 md:grid-cols-4">
            <div className="space-y-3">
              <button type="button" className="block hover:underline" onClick={() => navigate("tv")}>
                TV Shows
              </button>
              <button type="button" className="block hover:underline" onClick={() => navigate("browse")}>
                Movies
              </button>
            </div>
            <div className="space-y-3">
              <button type="button" className="block hover:underline" onClick={() => navigate("list")}>
                My List
              </button>
              <button type="button" className="block hover:underline" onClick={() => navigate("home")}>
                Home
              </button>
            </div>
            <div className="space-y-3">
              <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer" className="block hover:underline">
                TMDB
              </a>
              <a href="https://www.tvmaze.com" target="_blank" rel="noopener noreferrer" className="block hover:underline">
                TVMaze
              </a>
              <a href="https://cinesrc.st" target="_blank" rel="noopener noreferrer" className="block hover:underline">
                CineSrc
              </a>
              <a href="https://vidlink.pro" target="_blank" rel="noopener noreferrer" className="block hover:underline">
                VidLink
              </a>
            </div>
            <div className="space-y-3">
              <p className="text-[12px] leading-relaxed">
                Player keys: Space play/pause · ← → skip 10s · N next episode ·
                F fullscreen · M mute
              </p>
            </div>
          </div>

          <p className="mt-10 font-logo text-3xl tracking-[0.02em] text-[#e50914]">
            MATINEE
          </p>
          <p className="mt-4 text-[11px] leading-relaxed">
            This product uses the TMDB API but is not endorsed or certified by
            TMDB. Streams come from third-party providers — Matinee hosts no
            video. No accounts, no trackers — your list stays in your browser.
          </p>
        </div>
      </footer>

      {/* Modals */}
      <DetailModal
        open={detailOpen}
        onOpenChange={setDetailOpen}
        item={detailItem}
        onOpenMedia={openDetail}
        onToggleList={toggleList}
        isInList={isInList}
        onPlay={playMedia}
      />

      {/* Full-screen player (cinesrc.st) */}
      {playTarget && (
        <PlayerView target={playTarget} onBack={closePlayer} />
      )}
    </div>
  );
}

// ============================================================
// Continue Watching card
// ============================================================
function ContinueCard({
  entry,
  onResume,
  onRemove,
}: {
  entry: ProgressEntry;
  onResume: () => void;
  onRemove: () => void;
}) {
  const { item, season, episode, time, duration } = entry;
  const progress = duration > 0 ? time / duration : 0;
  const isTv = item.mediaType === "tv";
  const minutesLeft =
    duration > time ? Math.max(1, Math.round((duration - time) / 60)) : null;

  return (
    <div className="group relative w-[110px] shrink-0 sm:w-[125px] md:w-[135px] lg:w-[150px]">
      <div className="relative">
        {/* Clicking the poster resumes — that's what a Continue Watching
            card is for. (Previously no onOpen was passed, so taps on the
            poster did nothing at all.) */}
        <MovieCard
          item={item}
          fluid
          onPlay={() => onResume()}
          onOpen={() => onResume()}
          progress={progress}
        />
        <button
          type="button"
          aria-label={`Remove ${item.title} from Continue Watching`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute right-1.5 top-1.5 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-[11px] text-white transition-opacity hover:bg-black md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
        >
          ✕
        </button>
      </div>
      <div className="mt-1.5 space-y-0.5">
        <p className="line-clamp-1 text-[13px] text-[#e5e5e5]">{item.title}</p>
        <p className="text-[11px] text-[#777]">
          {isTv ? `S${season}:E${episode}` : item.year ?? ""}
          {minutesLeft ? ` · ${minutesLeft}m left` : ""}
        </p>
      </div>
    </div>
  );
}
