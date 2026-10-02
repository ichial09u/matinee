// ============================================================
// Continue-watching store (localStorage)
// Tracks playback position per title so the home page can show a
// "Continue Watching" row and the player can resume.
// ============================================================

import type { MediaItem } from "./types";

const STORE_KEY = "matinee_progress";
const MAX_ENTRIES = 20;

export interface ProgressEntry {
  /** `${mediaType}-${id}` */
  key: string;
  item: MediaItem;
  season?: number;
  episode?: number;
  /** playback position in seconds */
  time: number;
  /** total duration in seconds */
  duration: number;
  updatedAt: number;
}

export function progressKey(item: MediaItem): string {
  return `${item.mediaType}-${item.id}`;
}

function read(): ProgressEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
    return Array.isArray(parsed) ? (parsed as ProgressEntry[]) : [];
  } catch {
    return [];
  }
}

function write(entries: ProgressEntry[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify(entries.slice(0, MAX_ENTRIES))
    );
  } catch {
    /* storage full or blocked — progress is best-effort */
  }
}

/** All in-progress titles, most recently watched first */
export function listProgress(): ProgressEntry[] {
  return read().sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Saved progress for a specific title (or null) */
export function getProgress(item: MediaItem): ProgressEntry | null {
  const key = progressKey(item);
  return read().find((p) => p.key === key) || null;
}

/** Save/refresh progress for a title (upserts by key) */
export function saveProgress(entry: ProgressEntry) {
  const key = entry.key;
  const rest = read().filter((p) => p.key !== key);
  write([{ ...entry, updatedAt: Date.now() }, ...rest]);
}

/** Drop progress for a title (finished or removed by the user) */
export function removeProgress(key: string) {
  write(read().filter((p) => p.key !== key));
}
