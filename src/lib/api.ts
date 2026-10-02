// ============================================================
// Frontend API helpers — all data comes from our own routes,
// which run on a deployment-wide TMDB key (server-side only).
// ============================================================

import type { MediaItem, MediaDetail, Episode, FreeMovie } from "./types";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

// ---------- TMDB image URL helpers ----------
export const TMDB_IMG = "https://image.tmdb.org/t/p";
export const posterUrl = (path: string | null, size = "w500") =>
  path ? `${TMDB_IMG}/${size}${path}` : "";
export const backdropUrl = (path: string | null, size = "w1280") =>
  path ? `${TMDB_IMG}/${size}${path}` : "";
export const stillUrl = (path: string | null, size = "w300") =>
  path ? `${TMDB_IMG}/${size}${path}` : "";
/** TMDB clear title logo (Netflix-style title treatment) */
export const logoUrl = (path: string | null, size = "w500") =>
  path ? `${TMDB_IMG}/${size}${path}` : "";
/** Netflix-style "97% Match" from a TMDB 0–10 rating */
export const matchPercent = (rating: number | null): number | null =>
  rating != null && rating > 0 ? Math.round(rating * 10) : null;

// ---------- Lists ----------
export async function fetchList(
  list: string,
  page = 1,
  type: "movie" | "tv" = "movie"
): Promise<MediaItem[]> {
  const data = await getJson<{ items: MediaItem[] }>(
    `/api/movies?list=${list}&page=${page}&type=${type}`
  );
  return data.items;
}

export async function fetchDetails(
  id: number,
  type: "movie" | "tv"
): Promise<MediaDetail> {
  const data = await getJson<{ detail: MediaDetail }>(
    `/api/movies/${id}?type=${type}`
  );
  return data.detail;
}

export async function searchMedia(
  q: string,
  page = 1
): Promise<{ items: MediaItem[]; totalPages: number }> {
  return getJson<{ items: MediaItem[]; totalPages: number }>(
    `/api/movies/search?q=${encodeURIComponent(q)}&page=${page}`
  );
}

export async function fetchGenres(
  type: "movie" | "tv" = "movie"
): Promise<{ id: number; name: string }[]> {
  const data = await getJson<{ genres: { id: number; name: string }[] }>(
    `/api/genres?type=${type}`
  );
  return data.genres;
}

export async function discoverMedia(opts: {
  genre?: string;
  year?: string;
  sort?: string;
  page?: number;
  type?: "movie" | "tv";
}): Promise<{ items: MediaItem[]; totalPages: number }> {
  const p = new URLSearchParams();
  if (opts.genre) p.set("genre", opts.genre);
  if (opts.year) p.set("year", opts.year);
  if (opts.sort) p.set("sort", opts.sort);
  if (opts.page) p.set("page", String(opts.page));
  if (opts.type) p.set("type", opts.type);
  return getJson<{ items: MediaItem[]; totalPages: number }>(
    `/api/discover?${p.toString()}`
  );
}

// ---------- TV seasons ----------
export async function fetchSeason(
  id: number,
  season: number
): Promise<Episode[]> {
  const data = await getJson<{ episodes: Episode[] }>(
    `/api/tv/${id}/season/${season}`
  );
  return data.episodes;
}

// ---------- Free movies ----------
export async function fetchFreeMovies(): Promise<FreeMovie[]> {
  const data = await getJson<{ items: FreeMovie[] }>("/api/free/movies");
  return data.items;
}
