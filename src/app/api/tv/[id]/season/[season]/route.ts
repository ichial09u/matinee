import { NextRequest, NextResponse } from "next/server";
import { tmdb, resolveKey, TmdbError } from "@/lib/tmdb";
import type { Episode } from "@/lib/types";

// ============================================================
// GET /api/tv/:id/season/:season — episodes for one season (TMDB)
// ============================================================

interface RawEpisode {
  id: number;
  name?: string;
  overview?: string | null;
  episode_number?: number;
  season_number?: number;
  still_path?: string | null;
  runtime?: number | null;
  air_date?: string | null;
  vote_average?: number;
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; season: string }> }
) {
  const { id: rawId, season: rawSeason } = await ctx.params;
  const id = Number(rawId);
  const season = Number(rawSeason);
  if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(season) || season < 0) {
    return NextResponse.json({ error: "Invalid id or season" }, { status: 400 });
  }

  const key = resolveKey();

  try {
    const data = await tmdb<{ episodes: RawEpisode[] }>(
      `/tv/${id}/season/${season}`,
      key,
      {},
      600
    );

    const episodes: Episode[] = (data.episodes || [])
      .filter((e) => (e.episode_number ?? 0) > 0)
      .map((e) => ({
        id: e.id,
        name: e.name || `Episode ${e.episode_number}`,
        overview: e.overview || "",
        season: e.season_number ?? season,
        number: e.episode_number ?? 0,
        still: e.still_path || null,
        runtime: e.runtime ?? null,
        airDate: e.air_date || null,
        rating: e.vote_average ?? null,
      }));

    return NextResponse.json({ season, episodes });
  } catch (err) {
    if (err instanceof TmdbError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: "Failed to fetch episodes" },
      { status: 500 }
    );
  }
}
