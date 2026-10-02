// ============================================================
// Server-side HTTPS GET helper (Node runtime)
//
// The sandbox network has a broken IPv6 route: Node's global
// fetch (undici) tries IPv6 first for dual-stack hosts and
// times out. Forcing `family: 4` (IPv4-first) fixes external
// API calls. `src/instrumentation.ts` also sets ipv4first for
// production deployments; this helper guarantees it regardless.
// ============================================================

import https from "node:https";

export interface HttpResult {
  status: number;
  body: string;
}

export function httpsGet(
  url: string | URL,
  headers: Record<string, string> = {},
  timeoutMs = 15000
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const u = typeof url === "string" ? new URL(url) : url;
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: "GET",
        family: 4, // IPv4 first — see note above
        headers: { accept: "application/json", ...headers },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: string) => (data += chunk));
        res.on("end", () => {
          resolve({ status: res.statusCode || 0, body: data });
        });
      }
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Request to ${u.hostname} timed out`));
    });
    req.on("error", reject);
    req.end();
  });
}

export async function httpsGetJson<T>(
  url: string | URL,
  headers: Record<string, string> = {}
): Promise<T> {
  const { body } = await httpsGet(url, headers);
  return JSON.parse(body) as T;
}
