// ============================================================
// Next.js instrumentation hook — runs once when the server boots
// https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
//
// The sandbox network has a broken IPv6 route. Node's fetch
// (undici) tries IPv6 first for dual-stack hosts and times out.
// Forcing ipv4first fixes external API calls (TMDB / TVMaze).
// This is a no-op on healthy networks (IPv4 is simply preferred).
// ============================================================

export async function register() {
  // Only patch DNS in the Node.js server runtime (not Edge)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const dns = await import("node:dns");
    dns.setDefaultResultOrder("ipv4first");
  }
}
