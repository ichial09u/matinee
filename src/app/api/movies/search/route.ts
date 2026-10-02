import { NextRequest, NextResponse } from "next/server";
import { tmdb, resolveKey, TmdbError } from "@/lib/tmdb";
import type { MediaItem } from "@/lib/types";

// ============================================================
// GET /api/movies/search?q=...&page=1
// Multi-search across movies, TV and people
// ============================================================

interface RawMedia {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  profile_path?: string | null;
  vote_average?: number;
  release_date?: string;
  first_air_date?: string;
  known_for_department?: string;
}

export async function GET(req: NextRequest) {
  const key = resolveKey();

  const sp = req.nextUrl.searchParams;
  const query = (sp.get("q") || "").trim();
  const page = Math.max(1, Math.min(Number(sp.get("page")) || 1, 500));

  if (!query) {
    return NextResponse.json({ items: [], page: 1, totalPages: 1 });
  }

  try {
    const data = await tmdb<{
      results: RawMedia[];
      total_pages: number;
    }>("/search/multi", key, { query, page, include_adult: "false" }, 120);

    const items: MediaItem[] = (data.results || [])
      .filter((m) => m.media_type === "movie" || m.media_type === "tv")
      .filter((m) => m.poster_path || m.backdrop_path)
      .map((m) => ({
        id: m.id,
        title: m.title || m.name || "Untitled",
        overview: m.overview || "",
        poster: m.poster_path || null,
        backdrop: m.backdrop_path || null,
        rating: m.vote_average ?? null,
        year: (m.release_date || m.first_air_date || "").slice(0, 4) || null,
        mediaType: m.media_type as "movie" | "tv",
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
      { error: "Search failed" },
      { status: 500 }
    );
  }
}
