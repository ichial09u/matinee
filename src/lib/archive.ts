// ============================================================
// Internet Archive client-side helpers (runs in the BROWSER)
// archive.org is CORS-enabled and keyless. The sandbox server
// cannot reach archive.org, but the user's browser can.
// ============================================================

import type { FreeMovie } from "./types";

export interface ArchiveFile {
  name: string;
  format: string;
  size?: string;
  length?: string;
}

export interface ArchiveMetadata {
  files: ArchiveFile[];
  server?: string;
  dir?: string;
}

/** Abort archive.org requests after ~10s so the UI degrades gracefully */
function archiveFetch(url: string, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(t));
}

/** Fetch file list for an archive.org item (browser-side) */
export async function fetchArchiveMetadata(
  identifier: string
): Promise<ArchiveMetadata> {
  const res = await archiveFetch(`https://archive.org/metadata/${identifier}`);
  if (!res.ok) throw new Error("Could not reach Internet Archive");
  return (await res.json()) as ArchiveMetadata;
}

/** Pick the best playable file from an item's file list */
export function pickVideoFile(
  meta: ArchiveMetadata
): { url: string; format: string } | null {
  const prefs = [
    "h.264 IA",
    "512Kb MPEG4",
    "h.264",
    "MPEG4",
    "HiRes MPEG4",
    "Ogg Video",
    "QuickTime",
  ];
  for (const fmt of prefs) {
    const file = meta.files.find(
      (f) => f.format === fmt && /\.(mp4|m4v|ogv)$/i.test(f.name)
    );
    if (file) {
      return {
        url: `https://archive.org/download/${encodeURIComponent(
          meta.dir?.replace(/^\//, "") || ""
        )}/${encodeURIComponent(file.name)}`.replace(
          /download\/[^/]+\//,
          `download/`
        ),
        format: file.format,
      };
    }
  }
  // last resort: any mp4
  const anyMp4 = meta.files.find((f) => /\.mp4$/i.test(f.name));
  if (anyMp4) {
    return {
      url: `https://archive.org/download/${anyMp4.name}`,
      format: anyMp4.format,
    };
  }
  return null;
}

/**
 * Build the canonical download URL properly using item dir + file name.
 * (archive.org/download/<identifier>/<filename>)
 */
export function buildFileUrl(identifier: string, fileName: string): string {
  return `https://archive.org/download/${encodeURIComponent(
    identifier
  )}/${encodeURIComponent(fileName)}`;
}

/** Resolve a playable stream for an item: metadata → best mp4 */
export async function resolveStream(
  identifier: string
): Promise<{ url: string; format: string } | null> {
  const meta = await fetchArchiveMetadata(identifier);
  const prefs = [
    "h.264 IA",
    "h.264",
    "512Kb MPEG4",
    "HiRes MPEG4",
    "MPEG4",
    "Ogg Video",
  ];
  for (const fmt of prefs) {
    const file = meta.files.find(
      (f) => f.format === fmt && /\.(mp4|ogv)$/i.test(f.name)
    );
    if (file) {
      return { url: buildFileUrl(identifier, file.name), format: file.format };
    }
  }
  const anyVideo = meta.files.find(
    (f) => /\.(mp4|ogv|m4v)$/i.test(f.name) && f.name !== "description"
  );
  if (anyVideo) {
    return {
      url: buildFileUrl(identifier, anyVideo.name),
      format: anyVideo.format,
    };
  }
  return null;
}

/** Live search of archive.org feature films (browser-side) */
export async function searchArchiveMovies(
  page = 1,
  rows = 48,
  term = ""
): Promise<FreeMovie[]> {
  let q = "collection%3A(featurefilms)+AND+mediatype%3A(movies)";
  if (term.trim()) {
    q += `+AND+title%3A(${encodeURIComponent(term.trim())})`;
  }
  const url =
    `https://archive.org/advancedsearch.php?q=${q}` +
    `&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=year&fl%5B%5D=description&sort%5B%5D=downloads+desc` +
    `&rows=${rows}&page=${page}&output=json`;
  const res = await archiveFetch(url);
  if (!res.ok) throw new Error("Archive search failed");
  const data = (await res.json()) as {
    response?: {
      docs?: {
        identifier: string;
        title?: string | string[];
        year?: number | string;
        description?: string | string[];
      }[];
    };
  };
  const docs = data.response?.docs || [];
  return docs
    .filter((d) => d.identifier)
    .map((d) => {
      const title = Array.isArray(d.title) ? d.title[0] : d.title || "Untitled";
      let desc = Array.isArray(d.description)
        ? d.description[0]
        : d.description || "A classic public domain film.";
      desc = String(desc).replace(/<[^>]+>/g, "").trim();
      if (desc.length > 400) desc = desc.slice(0, 397) + "...";
      const yearNum = Number(
        Array.isArray(d.year) ? d.year[0] : d.year || 0
      );
      return {
        identifier: d.identifier,
        title: String(title),
        year: yearNum > 1800 && yearNum < 2100 ? yearNum : null,
        description: desc,
      };
    });
}
