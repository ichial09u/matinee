// ============================================================
// TMDB API client (server-side only)
// Docs: https://developer.themoviedb.org/reference/intro
// A deployment-wide key is baked in below; it can be overridden
// with the TMDB_API_KEY env var. The key never reaches the client.
// ============================================================

import { httpsGet } from "./http";

const TMDB_BASE = "https://api.themoviedb.org/3";
export const TMDB_IMG = "https://image.tmdb.org/t/p";

/** Built-in deployment key (server-side only, never sent to the browser) */
const BUILTIN_KEY = "da679b1021912724c1ed572201e2864c";

const memoryCache = new Map<string, { data: unknown; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export class TmdbError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Resolve the TMDB key: env var wins, built-in key as fallback */
export function resolveKey(_headerKey?: string | null): string {
  const key = process.env.TMDB_API_KEY?.trim() || BUILTIN_KEY;
  return key;
}

/** Build headers / params depending on key type (v3 key vs v4 bearer token) */
function authInit(key: string): {
  headers: Record<string, string>;
  params: Record<string, string>;
} {
  const trimmed = key.trim();
  // v4 read access tokens are JWTs (start with "eyJ")
  if (trimmed.startsWith("eyJ")) {
    return { headers: { Authorization: `Bearer ${trimmed}` }, params: {} };
  }
  return { headers: {}, params: { api_key: trimmed } };
}

/** Cached GET helper for TMDB endpoints (IPv4-forced, server-side) */
export async function tmdb<T>(
  path: string,
  key: string,
  extraParams: Record<string, string | number | undefined> = {},
  cacheSeconds = 300
): Promise<T> {
  const { headers, params } = authInit(key);
  const url = new URL(TMDB_BASE + path);
  for (const [k, v] of Object.entries({ ...params, ...extraParams })) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }

  const cacheKey = url.toString();
  const cached = memoryCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.data as T;
  }

  const { status, body } = await httpsGet(url, headers);

  if (status >= 400) {
    let msg = `TMDB request failed (${status})`;
    try {
      const parsed = JSON.parse(body) as { status_message?: string };
      if (parsed.status_message) msg = parsed.status_message;
    } catch {
      /* ignore */
    }
    throw new TmdbError(msg, status);
  }

  const data = JSON.parse(body) as T;
  memoryCache.set(cacheKey, {
    data,
    expires: Date.now() + Math.min(cacheSeconds * 1000, CACHE_TTL),
  });
  return data;
}
