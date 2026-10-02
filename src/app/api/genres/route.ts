import { NextRequest, NextResponse } from "next/server";
import { tmdb, resolveKey, TmdbError } from "@/lib/tmdb";

// ============================================================
// GET /api/genres — movie genres list from TMDB
// ============================================================

interface Genre {
  id: number;
  name: string;
}

export async function GET(req: NextRequest) {
  const key = resolveKey();

  const type = req.nextUrl.searchParams.get("type") === "tv" ? "tv" : "movie";

  try {
    const data = await tmdb<{ genres: Genre[] }>(`/genre/${type}/list`, key, {}, 86400);
    return NextResponse.json({ genres: data.genres || [] });
  } catch (err) {
    if (err instanceof TmdbError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: "Failed to fetch genres" },
      { status: 500 }
    );
  }
}
