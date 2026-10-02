// ============================================================
// Immersive playback helpers.
//
// When the user hits Play we want the screen to "flip" to a
// landscape theater automatically:
//   1. requestFullscreen() on the player surface — works on
//      desktop and Android right after the click (user
//      activation is still warm).
//   2. screen.orientation.lock("landscape") — Android Chrome
//      supports this while fullscreen; iOS Safari does not.
//   3. If the browser can't flip the screen natively, the
//      player surface gets the .force-landscape class (see
//      globals.css) which rotates the whole surface 90°, so
//      the show still plays horizontally — the viewer just
//      turns the phone.
// ============================================================

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: "landscape" | "portrait") => Promise<void>;
};

let touchCache: boolean | null = null;

/** Coarse-pointer / touch device (phones + tablets). Cached. */
export function isTouchDevice(): boolean {
  if (touchCache === null) {
    touchCache =
      typeof window !== "undefined" &&
      (window.matchMedia?.("(pointer: coarse)").matches ||
        "ontouchstart" in window);
  }
  return touchCache;
}

/** True when the viewport is taller than it is wide. */
export function isPortrait(): boolean {
  return window.innerHeight > window.innerWidth;
}

/**
 * Try to enter fullscreen and lock the screen to landscape.
 * Returns true when fullscreen was entered. Every failure mode
 * is swallowed — callers fall back to the CSS rotation and/or
 * retry on the next user gesture.
 */
export async function enterImmersive(el: HTMLElement | null): Promise<boolean> {
  if (!el || document.fullscreenElement) return false;
  const target = el as FullscreenElement;
  try {
    if (typeof target.requestFullscreen === "function") {
      await target.requestFullscreen({ navigationUI: "hide" });
    } else if (typeof target.webkitRequestFullscreen === "function") {
      await target.webkitRequestFullscreen();
    } else {
      return false; // no element fullscreen (e.g. iPhone Safari)
    }
  } catch {
    return false; // user activation expired or blocked — retry later
  }
  // Lock to landscape while we own the fullscreen element.
  // Rejected on iOS / desktop — that's fine, the CSS fallback
  // (.force-landscape) covers it.
  const orientation = screen.orientation as LockableOrientation | undefined;
  try {
    await orientation?.lock?.("landscape");
  } catch {
    // unsupported — ignore
  }
  return true;
}
