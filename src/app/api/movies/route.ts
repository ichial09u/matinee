import { NextRequest, NextResponse } from "next/server";
import { tmdb, resolveKey, TmdbError } from "@/lib/tmdb";
import type { MediaItem } from "@/lib/types";

// ============================================================
// GET /api/movies?list=trending|popular|top_rated|now_playing|upcoming
//          &page=1&type=movie|tv
// Returns a normalized list of MediaItems
// ============================================================
interface RawMedia {
  id: number;
  title?: string;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  release_date?: string;
  first_air_date?: string;
  genre_ids?: number[];
  original_language?: string | null;
}

function normalizeList(raw: RawMedia[], mediaType: "movie" | "tv"): MediaItem[] {
  return (raw || [])
    .filter((m) => m.poster_path || m.backdrop_path)
    .map((m) => ({
      id: m.id,
      title: m.title || m.name || "Untitled",
      overview: m.overview || "",
      poster: m.poster_path || null,
      backdrop: m.backdrop_path || null,
      rating: m.vote_average ?? null,
      year: (m.release_date || m.first_air_date || "").slice(0, 4) || null,
      releaseDate: m.release_date || m.first_air_date || null,
      mediaType,
      genreIds: m.genre_ids || [],
      originalLanguage: m.original_language || null,
    }));
}

export async function GET(req: NextRequest) {
  const key = resolveKey();

  const params = req.nextUrl.searchParams;
  const list = params.get("list") || "trending";
  const page = Math.max(1, Math.min(Number(params.get("page")) || 1, 500));
  const type = params.get("type") === "tv" ? "tv" : "movie";

  const paths: Record<string, string> = {
    trending: `/trending/${type}/week`,
    trending_day: `/trending/${type}/day`,
    popular: `/${type}/popular`,
    top_rated: `/${type}/top_rated`,
    now_playing: `/movie/now_playing`,
    upcoming: `/movie/upcoming`,
    airing_today: `/tv/airing_today`,
    on_the_air: `/tv/on_the_air`,
  };

  const path = paths[list];
  if (!path) {
    return NextResponse.json(
      { error: `Unknown list: ${list}` },
      { status: 400 }
    );
  }

  try {
    const data = await tmdb<{ results: RawMedia[] }>(path, key, { page });
    return NextResponse.json({
      items: normalizeList(data.results || [], type),
      page,
    });
  } catch (err) {
    if (err instanceof TmdbError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: "Failed to fetch movies" },
      { status: 500 }
    );
  }
}
