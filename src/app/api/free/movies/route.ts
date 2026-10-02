import { NextResponse } from "next/server";
import { FREE_MOVIES } from "@/lib/free-movies";

// ============================================================
// GET /api/free/movies — curated public-domain film catalog
// (playback metadata is fetched client-side from archive.org)
// ============================================================

export async function GET() {
  return NextResponse.json({ items: FREE_MOVIES });
}
