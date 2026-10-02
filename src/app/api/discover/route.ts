import { NextRequest, NextResponse } from "next/server";
import { tmdb, resolveKey, TmdbError } from "@/lib/tmdb";
import type { MediaItem } from "@/lib/types";

// ============================================================
// GET /api/discover — advanced browse
//   ?genre=28&year=2025&sort=popularity.desc&page=1&type=movie|tv
//   ?query=... is NOT this route (that's /api/movies/search)
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
}

export async function GET(req: NextRequest) {
  const key = resolveKey();

  const sp = req.nextUrl.searchParams;
  const type = sp.get("type") === "tv" ? "tv" : "movie";
  const page = Math.max(1, Math.min(Number(sp.get("page")) || 1, 500));
  const genre = sp.get("genre") || "";
  const year = sp.get("year") || "";
  const sort = sp.get("sort") || "popularity.desc";
  const minVotes = type === "movie" ? "50" : "10";

  const params: Record<string, string | number> = {
    page,
    sort_by: sort,
    include_adult: "false",
    "vote_count.gte": minVotes,
  };
  if (genre) params.with_genres = genre;
  if (year) {
    if (/^\d{4}s$/.test(year)) {
      // Decade shorthand ("2010s") → date range
      const start = parseInt(year.slice(0, 4), 10);
      if (type === "movie") {
        params["primary_release_date.gte"] = `${start}-01-01`;
        params["primary_release_date.lte"] = `${start + 9}-12-31`;
      } else {
        params["first_air_date.gte"] = `${start}-01-01`;
        params["first_air_date.lte"] = `${start + 9}-12-31`;
      }
    } else if (type === "movie") {
      params.primary_release_year = year;
    } else {
      params.first_air_date_year = year;
    }
  }

  try {
    const data = await tmdb<{ results: RawMedia[]; total_pages: number }>(
      `/discover/${type}`,
      key,
      params
    );
    const items: MediaItem[] = (data.results || [])
      .filter((m) => m.poster_path || m.backdrop_path)
      .map((m) => ({
        id: m.id,
        title: m.title || m.name || "Untitled",
        overview: m.overview || "",
        poster: m.poster_path || null,
        backdrop: m.backdrop_path || null,
        rating: m.vote_average ?? null,
        year: (m.release_date || m.first_air_date || "").slice(0, 4) || null,
        mediaType: type,
        genreIds: m.genre_ids || [],
      }));
    return NextResponse.json({
      items,
      page,
      totalPages: Math.min(data.total_pages || 1, 500),
    });
  } catch (err) {
    if (err instanceof TmdbError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: "Failed to discover movies" },
      { status: 500 }
    );
  }
}
