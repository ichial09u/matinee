// ============================================================
// Release-date helpers.
//
// CineSrc can only serve what has actually been released, so
// anything with a future TMDB date is "not streamable yet":
// cards show a countdown badge, the detail page shows a live
// timer, and every play path refuses to start.
// ============================================================

/** Parse a TMDB "YYYY-MM-DD" (UTC) date into a timestamp. */
function releaseTs(date: string | null | undefined): number | null {
  if (!date) return null;
  const t = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(t) ? t : null;
}

/** True when the title hasn't premiered yet (no date = released). */
export function isUnreleased(date: string | null | undefined): boolean {
  const t = releaseTs(date);
  return t != null && t > Date.now();
}

/** Compact badge text: "3d", "2mo", "1y"… */
export function shortCountdown(date: string | null | undefined): string | null {
  const t = releaseTs(date);
  if (t == null) return null;
  const ms = t - Date.now();
  if (ms <= 0) return null;
  const mins = Math.floor(ms / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);
  if (years > 0) return `${years}y`;
  if (months > 0) return `${months}mo`;
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  return `${Math.max(1, mins)}m`;
}

/** Full countdown parts for the detail-page timer. */
export function countdownParts(
  date: string | null | undefined
): { d: number; h: number; m: number; s: number } | null {
  const t = releaseTs(date);
  if (t == null) return null;
  const ms = Math.max(0, t - Date.now());
  return {
    d: Math.floor(ms / 86_400_000),
    h: Math.floor(ms / 3_600_000) % 24,
    m: Math.floor(ms / 60_000) % 60,
    s: Math.floor(ms / 1_000) % 60,
  };
}

/** Pretty premiere date, e.g. "Oct 31, 2026". */
export function prettyDate(date: string | null | undefined): string | null {
  const t = releaseTs(date);
  if (t == null) return null;
  return new Date(t).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
