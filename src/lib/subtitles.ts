// ============================================================
// Subtitles / closed captions, in-house.
//
// The cinesrc embed API has no captions command, so Matinee runs
// its own caption layer: we search open subtitle indexes by TMDB
// id (the same ids the player already uses), fetch the SRT/VTT
// file directly in the browser (the API is CORS-open), parse it
// into cues, and render them over the video surface synced to
// the player's own timeupdate events.
// ============================================================

/** One timed caption cue. */
export interface Cue {
  start: number; // seconds
  end: number; // seconds
  text: string; // may contain \n for multi-line cues
}

/** A single subtitle file from the search API. */
export interface SubtitleFile {
  id: string;
  url: string;
  display: string; // "English", "Portuguese (BR)"…
  language: string; // "en", "pt"…
  isHearingImpaired?: boolean;
  isMachineTranslated?: boolean;
  isTrusted?: boolean;
  downloadCount?: number;
}

/** One language row in the picker (best file pre-selected). */
export interface SubtitleLang {
  language: string; // display name
  count: number; // how many files in this language
  best: SubtitleFile;
}

const SUBS_SEARCH = "https://subs.bright67.online/search";

function parseTimestamp(ts: string): number | null {
  // "00:01:02,500" / "01:02.500" / "00:01:02.500" — SRT uses ','
  // for millis, VTT uses '.'.
  const m = ts.trim().match(
    /^(?:(\d{1,3}):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/
  );
  if (!m) return null;
  const h = Number(m[1] || 0);
  const min = Number(m[2]);
  const s = Number(m[3]);
  const ms = Number(m[4].padEnd(3, "0"));
  return h * 3600 + min * 60 + s + ms / 1000;
}

/**
 * Parse an SRT or WebVTT subtitle file into cues.
 * Handles both formats (SRT "," millis / VTT "." millis, optional
 * cue ids, WEBVTT header, inline tags are stripped).
 */
export function parseSubtitles(raw: string): Cue[] {
  const text = raw
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/^WEBVTT.*$/im, "");
  const cues: Cue[] = [];
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    const idx = lines.findIndex((l) => l.includes("-->"));
    if (idx === -1) continue;
    const [rawStart, rest] = lines[idx].split("-->");
    if (!rest) continue;
    // End timestamp may carry VTT cue settings after it.
    const rawEnd = rest.trim().split(/\s+/)[0];
    const start = parseTimestamp(rawStart);
    const end = parseTimestamp(rawEnd);
    if (start == null || end == null || end <= start) continue;
    const body = lines
      .slice(idx + 1)
      .join("\n")
      // strip HTML-ish inline tags (<i>, <font …>); keep the text
      .replace(/<\/?[^>]+>/g, "")
      .trim();
    if (!body) continue;
    cues.push({ start, end, text: body });
  }
  return cues.sort((a, b) => a.start - b.start);
}

/** Quality score for picking the best file in a language. */
function score(s: SubtitleFile): number {
  return (
    (s.isMachineTranslated ? 0 : 1_000_000_000) +
    (s.isHearingImpaired ? 0 : 1_000_000) +
    (s.isTrusted ? 100_000 : 0) +
    (s.downloadCount || 0)
  );
}

/**
 * Search subtitles for a movie or TV episode by TMDB id.
 * Returns one row per language, best file pre-picked, English
 * first, then by file count.
 */
export async function fetchSubtitleLanguages(
  tmdbId: number,
  season?: number,
  episode?: number,
  signal?: AbortSignal
): Promise<SubtitleLang[]> {
  const u = new URL(SUBS_SEARCH);
  u.searchParams.set("id", String(tmdbId));
  if (season != null && episode != null) {
    u.searchParams.set("season", String(season));
    u.searchParams.set("episode", String(episode));
  }
  const res = await fetch(u.toString(), { signal });
  if (!res.ok) throw new Error(`Subtitle search returned ${res.status}`);
  const list = (await res.json()) as SubtitleFile[];
  if (!Array.isArray(list)) throw new Error("Subtitle search: bad response");

  const byLang = new Map<string, SubtitleFile[]>();
  for (const s of list) {
    if (!s?.url || !s.display) continue;
    const arr = byLang.get(s.display) || [];
    arr.push(s);
    byLang.set(s.display, arr);
  }
  const langs: SubtitleLang[] = [];
  for (const [language, files] of byLang) {
    const best = files.reduce((a, b) => (score(b) > score(a) ? b : a));
    langs.push({ language, count: files.length, best });
  }
  langs.sort((a, b) => {
    if (a.language === "English") return -1;
    if (b.language === "English") return 1;
    return b.count - a.count || a.language.localeCompare(b.language);
  });
  return langs;
}

/** Download and parse one subtitle file. */
export async function fetchSubtitleCues(
  url: string,
  signal?: AbortSignal
): Promise<Cue[]> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Subtitle download returned ${res.status}`);
  return parseSubtitles(await res.text());
}

/** Find the cue that should be on screen at time t (seconds). */
export function cueAt(cues: Cue[], t: number): Cue | null {
  for (const c of cues) {
    if (t >= c.start && t <= c.end) return c;
    if (c.start > t) break; // sorted — nothing later can be active
  }
  return null;
}
