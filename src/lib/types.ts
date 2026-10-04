// ============================================================
// Shared types for the movie site
// ============================================================

/** Normalized movie/TV item used across the UI */
export interface MediaItem {
  id: number;
  title: string;
  overview: string;
  poster: string | null;
  backdrop: string | null;
  rating: number | null;
  year: string | null;
  mediaType: "movie" | "tv";
  genreIds?: number[];
  /** TMDB release/first-air date "YYYY-MM-DD" — future = not on CineSrc yet */
  releaseDate?: string | null;
}

/** Extended detail for a movie/show */
export interface MediaDetail extends MediaItem {
  tagline?: string | null;
  runtime?: number | null;
  genres?: { id: number; name: string }[];
  status?: string | null;
  releaseDate?: string | null;
  homepage?: string | null;
  cast?: CastMember[];
  trailerKey?: string | null;
  similar?: MediaItem[];
  providers?: { name: string; logo: string; id: number }[];
  seasons?: number | null;
  episodeCount?: number | null;
  /** Real seasons (no specials) with episode counts — for the episode picker */
  seasonsList?: {
    number: number;
    name: string;
    episodeCount: number;
    airDate: string | null;
  }[];
  /** TMDB clear-logo path (title treatment image, like Netflix billboards) */
  logo?: string | null;
  /** US maturity rating, e.g. "PG-13" / "TV-MA" */
  certification?: string | null;
}

export interface CastMember {
  id: number;
  name: string;
  character: string | null;
  profile: string | null;
}

/** One TV episode (TMDB) */
export interface Episode {
  id: number;
  name: string;
  overview: string;
  season: number;
  number: number;
  still: string | null;
  runtime: number | null;
  airDate: string | null;
  rating: number | null;
}

export interface ApiError {
  error: string;
  code?: number;
}
