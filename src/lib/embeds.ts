// ============================================================
// Streaming embed providers.
//
// Matinee overlays its own player on top of a sandboxed,
// popup-proof embed. CineSrc is the only provider with a
// two-way postMessage API (full Matinee chrome); the others
// run in "direct mode" — their own player UI inside our
// sandboxed iframe (no popups can ever open).
//
// VidLink is the default: it is fast, keyed by TMDB ids (no
// IMDb lookup needed), and it has a dedicated ANIME path with
// sub/dub selection in the URL:
//   https://vidlink.pro/anime/{MALid}/{episode}/{sub|dub}
// ============================================================

export type SourceId =
  | "vidlink"
  | "cinesrc"
  | "embed2"
  | "multiembed"
  | "vidsrc";

export type AnimeAudio = "sub" | "dub";

export interface EmbedRequest {
  kind: "movie" | "tv";
  tmdbId: number;
  season?: number;
  episode?: number;
  /** Anime extras (VidLink anime path only) */
  anime?: { malId: number; episode: number } | null;
  /** "sub" or "dub" audio for the anime path */
  audio?: AnimeAudio;
  /** Resume position in seconds (providers that support it) */
  startAt?: number;
  /** CineSrc: reload with the embed's own controls (Cast mode) */
  castMode?: boolean;
  /** CineSrc: server that worked last time */
  lastServer?: string | null;
  /** Cache-busting nonce for reloads */
  nonce?: number;
}

export interface EmbedProvider {
  id: SourceId;
  /** Short name shown in the source switcher */
  label: string;
  /** How the player talks to the embed:
   *  "cinesrc" → two-way postMessage commands (full Matinee chrome)
   *  "vidlink" → one-way PLAYER_EVENT stream (progress, play state)
   *  "none"    → no integration; the embed runs fully on its own  */
  events: "cinesrc" | "vidlink" | "none";
  /** Has a dedicated anime catalog (sub/dub) */
  supportsAnime: boolean;
  /** Supports resume via URL parameter */
  supportsStartAt: boolean;
  /** Longer description for the source menu */
  note: string;
  buildUrl: (req: EmbedRequest) => string;
}

const ACCENT = "e50914"; // Matinee red, without the #

/** Shared VidLink look: Matinee colors, no doubled-up title/poster UI */
function vidlinkParams(p: {
  startAt?: number;
  tv: boolean;
}): string {
  const params = new URLSearchParams({
    primaryColor: ACCENT,
    secondaryColor: "666666",
    iconColor: "ffffff",
    title: "false",
    poster: "false",
    // Their own Next Episode button appears at 90% watched (TV only)
    nextbutton: p.tv ? "true" : "false",
  });
  if (p.startAt && p.startAt > 45) params.set("startAt", String(Math.floor(p.startAt)));
  return params.toString();
}

export const PROVIDERS: EmbedProvider[] = [
  {
    id: "vidlink",
    label: "VidLink",
    events: "vidlink",
    supportsAnime: true,
    supportsStartAt: true,
    note: "Fast default · movies, TV and anime with sub/dub",
    buildUrl: (req) => {
      // Anime goes through the dedicated MyAnimeList-keyed path
      if (req.anime) {
        const params = new URLSearchParams({
          primaryColor: ACCENT,
          secondaryColor: "666666",
          iconColor: "ffffff",
          title: "false",
          poster: "false",
          // If the chosen audio track doesn't exist, play the other
          // one instead of erroring out.
          fallback: "true",
        });
        if (req.startAt && req.startAt > 45) {
          params.set("startAt", String(Math.floor(req.startAt)));
        }
        if (req.nonce) params.set("_r", String(req.nonce));
        return `https://vidlink.pro/anime/${req.anime.malId}/${req.anime.episode}/${
          req.audio || "sub"
        }?${params.toString()}`;
      }
      const base = req.kind === "tv"
        ? `https://vidlink.pro/tv/${req.tmdbId}/${req.season || 1}/${req.episode || 1}`
        : `https://vidlink.pro/movie/${req.tmdbId}`;
      const params = vidlinkParams({ startAt: req.startAt, tv: req.kind === "tv" });
      return `${base}?${params}${req.nonce ? `&_r=${req.nonce}` : ""}`;
    },
  },
  {
    id: "cinesrc",
    label: "Matinee Player",
    events: "cinesrc",
    supportsAnime: false,
    supportsStartAt: true,
    note: "Full Matinee controls (CineSrc source)",
    buildUrl: (req) => {
      const base = req.kind === "tv"
        ? `https://cinesrc.st/embed/tv/${req.tmdbId}?s=${req.season}&e=${req.episode}`
        : `https://cinesrc.st/embed/movie/${req.tmdbId}`;
      const p = new URLSearchParams({
        color: `#${ACCENT}`,
        controls: req.castMode ? "true" : "false",
        prioritize: "true",
        autoskip: "true",
      });
      if (req.lastServer) p.set("lastserver", req.lastServer);
      if (req.startAt && req.startAt > 45) {
        p.set("t", String(req.startAt));
        p.set("continueprompt", "false");
      }
      if (req.nonce) p.set("_r", String(req.nonce));
      return `${base}${base.includes("?") ? "&" : "?"}${p.toString()}`;
    },
  },
  {
    id: "embed2",
    label: "2Embed",
    events: "none",
    supportsAnime: false,
    supportsStartAt: false,
    note: "Backup source · movies and TV",
    buildUrl: (req) => {
      const base = req.kind === "tv"
        ? `https://www.2embed.cc/embedtv/${req.tmdbId}&s=${req.season || 1}&e=${req.episode || 1}`
        : `https://www.2embed.cc/embed/${req.tmdbId}`;
      return req.nonce ? `${base}${base.includes("?") ? "&" : "?"}_r=${req.nonce}` : base;
    },
  },
  {
    id: "multiembed",
    label: "MultiEmbed",
    events: "none",
    supportsAnime: false,
    supportsStartAt: false,
    note: "Backup source · multi-server picker",
    buildUrl: (req) => {
      const p = new URLSearchParams({ tmdb: String(req.tmdbId) });
      if (req.kind === "tv") {
        p.set("s", String(req.season || 1));
        p.set("e", String(req.episode || 1));
      }
      if (req.nonce) p.set("_r", String(req.nonce));
      return `https://multiembed.mov/?${p.toString()}`;
    },
  },
  {
    id: "vidsrc",
    label: "VidSrc",
    events: "none",
    supportsAnime: false,
    supportsStartAt: false,
    note: "Backup source · the classic catalog",
    buildUrl: (req) => {
      const p = new URLSearchParams({ tmdb: String(req.tmdbId) });
      if (req.kind === "tv") {
        p.set("season", String(req.season || 1));
        p.set("episode", String(req.episode || 1));
      }
      if (req.nonce) p.set("_r", String(req.nonce));
      return `https://vidsrc.xyz/embed/${req.kind === "tv" ? "tv" : "movie"}?${p.toString()}`;
    },
  },
];

export function getProvider(id: SourceId): EmbedProvider {
  return PROVIDERS.find((p) => p.id === id) || PROVIDERS[0];
}

// ---------- stored preferences ----------

const SOURCE_KEY = "matinee_source";
const AUDIO_KEY = "matinee_anime_audio";

/** Last source the user picked by hand (default: VidLink — the fast one) */
export function storedSource(): SourceId {
  try {
    const v = localStorage.getItem(SOURCE_KEY) as SourceId | null;
    if (v && PROVIDERS.some((p) => p.id === v)) return v;
  } catch {
    /* private mode */
  }
  return "vidlink";
}

export function storeSource(id: SourceId) {
  try {
    localStorage.setItem(SOURCE_KEY, id);
  } catch {
    /* private mode */
  }
}

/** Last sub/dub choice for anime */
export function storedAudio(): AnimeAudio {
  try {
    const v = localStorage.getItem(AUDIO_KEY);
    if (v === "sub" || v === "dub") return v;
  } catch {
    /* private mode */
  }
  return "sub";
}

export function storeAudio(audio: AnimeAudio) {
  try {
    localStorage.setItem(AUDIO_KEY, audio);
  } catch {
    /* private mode */
  }
}
