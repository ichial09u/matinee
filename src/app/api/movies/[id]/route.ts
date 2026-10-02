import { NextRequest, NextResponse } from "next/server";
import { tmdb, resolveKey, TmdbError, TMDB_IMG } from "@/lib/tmdb";
import type { MediaDetail } from "@/lib/types";

// ============================================================
// GET /api/movies/:id?type=movie|tv
// Details with credits, videos, similar, and watch providers
// ============================================================

interface RawDetail {
  id: number;
  title?: string;
  name?: string;
  overview?: string;
  tagline?: string | null;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  release_date?: string;
  first_air_date?: string;
  status?: string;
  homepage?: string | null;
  runtime?: number | null;
  episode_run_time?: number[];
  number_of_seasons?: number;
  number_of_episodes?: number;
  seasons?: {
    season_number: number;
    name?: string;
    episode_count?: number;
    air_date?: string | null;
  }[];
  genres?: { id: number; name: string }[];
  credits?: {
    cast?: {
      id: number;
      name: string;
      character?: string | null;
      profile_path?: string | null;
    }[];
  };
  videos?: {
    results?: {
      key: string;
      name: string;
      site: string;
      type: string;
      official?: boolean;
    }[];
  };
  similar?: { results?: RawItem[] };
  recommendations?: { results?: RawItem[] };
  images?: {
    logos?: { file_path: string; iso_639_1: string | null }[];
  };
  release_dates?: {
    results?: {
      iso_3166_1: string;
      release_dates?: { certification?: string | null }[];
    }[];
  };
  content_ratings?: {
    results?: { iso_3166_1: string; rating?: string | null }[];
  };
  "watch/providers"?: {
    results?: Record<
      string,
      {
        link?: string;
        flatrate?: { provider_id: number; provider_name: string; logo_path: string }[];
        rent?: { provider_id: number; provider_name: string; logo_path: string }[];
        buy?: { provider_id: number; provider_name: string; logo_path: string }[];
      }
    >;
  };
}

interface RawItem {
  id: number;
  title?: string;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  release_date?: string;
  first_air_date?: string;
}

function toSimple(m: RawItem, type: "movie" | "tv") {
  return {
    id: m.id,
    title: m.title || m.name || "Untitled",
    overview: m.overview || "",
    poster: m.poster_path || null,
    backdrop: m.backdrop_path || null,
    rating: m.vote_average ?? null,
    year: (m.release_date || m.first_air_date || "").slice(0, 4) || null,
    mediaType: type,
  };
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await ctx.params;
  const id = Number(rawId);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const key = resolveKey();

  const type = req.nextUrl.searchParams.get("type") === "tv" ? "tv" : "movie";

  try {
    const data = await tmdb<RawDetail>(
      `/${type}/${id}`,
      key,
      {
        append_to_response: `credits,videos,similar,recommendations,watch/providers,images,${
          type === "movie" ? "release_dates" : "content_ratings"
        }`,
        include_image_language: "en,null",
      },
      600
    );

    // Title logo — prefer an English clear-logo
    const logos = data.images?.logos || [];
    const logo =
      (logos.find((l) => l.iso_639_1 === "en") || logos[0])?.file_path || null;

    // US maturity rating
    let certification: string | null = null;
    if (type === "movie") {
      const us = (data.release_dates?.results || []).find(
        (r) => r.iso_3166_1 === "US"
      );
      certification =
        us?.release_dates?.find((rd) => rd.certification)?.certification || null;
    } else {
      const us = (data.content_ratings?.results || []).find(
        (r) => r.iso_3166_1 === "US"
      );
      certification = us?.rating || null;
    }

    // Pick the best official trailer (YouTube, English first)
    const videos = data.videos?.results || [];
    const trailer =
      videos.find((v) => v.site === "YouTube" && v.type === "Trailer" && v.official) ||
      videos.find((v) => v.site === "YouTube" && v.type === "Trailer") ||
      videos.find((v) => v.site === "YouTube") ||
      null;

    // Watch providers — prefer US, else any available region
    const providerResults = data["watch/providers"]?.results || {};
    const region = providerResults.US ? "US" : Object.keys(providerResults)[0];
    const regionData = region ? providerResults[region] : undefined;
    const providerList =
      regionData?.flatrate || regionData?.rent || regionData?.buy || [];

    const similarRaw =
      (data.recommendations?.results?.length
        ? data.recommendations.results
        : data.similar?.results) || [];

    // Season list for the episode picker (real seasons only, no specials)
    const seasonsList = (data.seasons || [])
      .filter((s) => s.season_number > 0 && (s.episode_count ?? 0) > 0)
      .map((s) => ({
        number: s.season_number,
        name: s.name || `Season ${s.season_number}`,
        episodeCount: s.episode_count ?? 0,
        airDate: s.air_date || null,
      }));

    const detail: MediaDetail = {
      id: data.id,
      title: data.title || data.name || "Untitled",
      overview: data.overview || "No overview available.",
      poster: data.poster_path || null,
      backdrop: data.backdrop_path || null,
      rating: data.vote_average ?? null,
      year: (data.release_date || data.first_air_date || "").slice(0, 4) || null,
      mediaType: type,
      tagline: data.tagline || null,
      runtime: data.runtime || data.episode_run_time?.[0] || null,
      genres: data.genres || [],
      status: data.status || null,
      releaseDate: data.release_date || data.first_air_date || null,
      homepage: data.homepage || null,
      cast: (data.credits?.cast || []).slice(0, 12).map((c) => ({
        id: c.id,
        name: c.name,
        character: c.character || null,
        profile: c.profile_path || null,
      })),
      trailerKey: trailer?.key || null,
      similar: similarRaw
        .filter((m) => m.poster_path || m.backdrop_path)
        .slice(0, 12)
        .map((m) => toSimple(m, type)),
      providers: providerList.slice(0, 8).map((p) => ({
        id: p.provider_id,
        name: p.provider_name,
        logo: p.logo_path ? `${TMDB_IMG}/w92${p.logo_path}` : "",
      })),
      seasons: data.number_of_seasons ?? null,
      episodeCount: data.number_of_episodes ?? null,
      seasonsList,
      logo,
      certification,
    };

    return NextResponse.json({ detail, providerRegion: region || null });
  } catch (err) {
    if (err instanceof TmdbError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: "Failed to fetch details" },
      { status: 500 }
    );
  }
}
