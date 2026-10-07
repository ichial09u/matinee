// ============================================================
// Anime detection + TMDB → MyAnimeList mapping.
//
// Detection: Japanese original language + TMDB "Animation"
// genre (16), or the explicit "anime" keyword (210024) which
// the detail route forwards from TMDB keywords.
//
// Mapping: VidLink's anime path is keyed by MyAnimeList ids:
//   https://vidlink.pro/anime/{MALid}/{episode}/{sub|dub}
// AniList's GraphQL API (public, CORS-enabled, keyless) is
// used to resolve a title to its MAL id. TMDB seasons rarely
// line up with MAL entries, so:
//   - Season 1      → the show's own MAL entry, episode as-is
//   - Season N > 1  → search "Title Season N" first (most anime
//                     have separate MAL entries per season);
//                     if that finds a different TV-format entry
//                     use it, otherwise fall back to ABSOLUTE
//                     episode numbering on the base entry
//                     (one continuous MAL entry — One Piece etc.)
// Results are cached in sessionStorage per (show, season).
// ============================================================

const ANILIST_URL = "https://graphql.anilist.co";
const CACHE_PREFIX = "matinee_anime:";
const GENRE_ANIMATION = 16;
const KEYWORD_ANIME = 210024;

export interface AnimeCandidate {
  title?: string;
  /** Japanese-original animation? (genre ids + language, or keyword id) */
  genreIds?: number[];
  keywords?: number[];
  originalLanguage?: string | null;
}

/** Best-effort anime check from the data TMDB already gave us. */
export function isAnime(item: AnimeCandidate): boolean {
  if (item.keywords?.includes(KEYWORD_ANIME)) return true;
  const animated = item.genreIds?.includes(GENRE_ANIMATION);
  return Boolean(animated && item.originalLanguage === "ja");
}

// ---------- AniList client ----------

interface AniListMedia {
  id: number;
  idMal: number | null;
  episodes: number | null;
  format: string | null;
  title: { english: string | null; romaji: string | null };
}

const SEARCH_QUERY = `
query ($search: String, $format: MediaFormat) {
  Page(perPage: 6) {
    media(search: $search, type: ANIME, format: $format, sort: SEARCH_MATCH, isAdult: false) {
      id
      idMal
      episodes
      format
      title { english romaji }
    }
  }
}`;

async function anilistSearch(
  search: string,
  format?: "MOVIE"
): Promise<AniListMedia[]> {
  const res = await fetch(ANILIST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: SEARCH_QUERY,
      variables: { search, format: format ?? undefined },
    }),
  });
  if (!res.ok) throw new Error(`AniList request failed (${res.status})`);
  const json = (await res.json()) as {
    data?: { Page?: { media?: AniListMedia[] } };
  };
  return json.data?.Page?.media || [];
}

const TV_FORMATS = new Set(["TV", "TV_SHORT", "ONA"]);

/** Rank candidates: exact title matches first, TV-ish formats next. */
function pickBest(cands: AniListMedia[], query: string): AniListMedia | null {
  const q = query.toLowerCase().trim();
  const score = (m: AniListMedia): number => {
    const en = m.title.english?.toLowerCase() ?? "";
    const ro = m.title.romaji?.toLowerCase() ?? "";
    let s = 0;
    if (en && en === q) s = 100;
    else if (ro && ro === q) s = 90;
    else if (en && (en.includes(q) || q.includes(en))) s = 70;
    else if (ro && (ro.includes(q) || q.includes(ro))) s = 60;
    else s = 30;
    if (m.idMal) s += 10;
    if (TV_FORMATS.has(m.format || "")) s += 5;
    return s;
  };
  return cands
    .filter((m) => m.idMal)
    .sort((a, b) => score(b) - score(a))[0] || null;
}

// ---------- TMDB → MAL resolution ----------

export interface AnimeMapping {
  /** MyAnimeList id for the entry this TMDB season maps to */
  malId: number;
  /** Episode number to request on that MAL entry */
  episode: number;
  /** "season" = per-season MAL entry · "absolute" = continuous entry */
  numbering: "season" | "absolute";
}

interface ResolveInput {
  /** TMDB show id (for caching) */
  tmdbId: number;
  title: string;
  kind: "movie" | "tv";
  season: number;
  episode: number;
  /** TMDB real seasons with episode counts (for absolute numbering) */
  seasonsList: { number: number; episodeCount: number }[];
}

function readCache(key: string): AnimeMapping | null {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + key);
    return raw ? (JSON.parse(raw) as AnimeMapping) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: AnimeMapping | null) {
  try {
    if (value) sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value));
  } catch {
    /* full / private mode — no cache, no problem */
  }
}

/**
 * Resolve the MAL id + episode number for a TMDB anime title.
 * Returns null when no mapping could be found (fall back to the
 * regular movie/TV embeds in that case).
 */
export async function resolveAnime(
  input: ResolveInput
): Promise<AnimeMapping | null> {
  const { tmdbId, title, kind, season, episode, seasonsList } = input;
  const cacheKey = `${tmdbId}:${kind === "movie" ? "m" : `s${season}`}`;
  const cached = readCache(cacheKey);
  if (cached) return cached;

  // ---- movies: one MAL entry, "episode 1" ----
  if (kind === "movie") {
    let cands = await anilistSearch(title, "MOVIE").catch(() => []);
    let best = pickBest(cands, title);
    if (!best) {
      cands = await anilistSearch(title).catch(() => []);
      // Prefer the MOVIE-format result if the plain search mixed formats
      best =
        cands.filter((m) => m.idMal && m.format === "MOVIE").sort((a, b) => {
          const qa = a.title.english === title ? 1 : 0;
          const qb = b.title.english === title ? 1 : 0;
          return qb - qa;
        })[0] || null;
    }
    if (!best?.idMal) return null;
    const mapping: AnimeMapping = {
      malId: best.idMal,
      episode: 1,
      numbering: "season",
    };
    writeCache(cacheKey, mapping);
    return mapping;
  }

  // ---- TV ----
  const base = pickBest(await anilistSearch(title).catch(() => []), title);
  if (!base?.idMal) return null;

  if (season <= 1) {
    const mapping: AnimeMapping = {
      malId: base.idMal,
      episode,
      numbering: "season",
    };
    writeCache(cacheKey, mapping);
    return mapping;
  }

  // Season > 1: look for a dedicated MAL entry for this season
  const seasonTitle = `${title} season ${season}`;
  const seqCandidates = (
    await anilistSearch(seasonTitle).catch(() => [])
  ).filter((m) => TV_FORMATS.has(m.format || ""));
  const seq = pickBest(seqCandidates, seasonTitle);

  if (seq?.idMal && seq.idMal !== base.idMal) {
    // A distinct entry exists for this season ("Attack on Titan Season 2")
    const mapping: AnimeMapping = {
      malId: seq.idMal,
      episode,
      numbering: "season",
    };
    writeCache(cacheKey, mapping);
    return mapping;
  }

  // One continuous MAL entry (One Piece, long-running shows):
  // count TMDB episodes of every earlier season and add ours.
  const prior = seasonsList
    .filter((s) => s.number > 0 && s.number < season)
    .reduce((sum, s) => sum + (s.episodeCount || 0), 0);
  const mapping: AnimeMapping = {
    malId: base.idMal,
    episode: prior + episode,
    numbering: "absolute",
  };
  writeCache(cacheKey, mapping);
  return mapping;
}
