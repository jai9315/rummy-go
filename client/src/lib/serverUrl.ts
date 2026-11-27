const CONFIGURED_SERVER_URL = (
  process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:4000"
).replace(/\/+$/, "");

function isLocalhostUrl(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url);
}

/**
 * Resolves the REST API base URL.
 * - On localhost, uses NEXT_PUBLIC_SERVER_URL (default http://localhost:4000).
 * - When accessed via a remote/proxied preview host (e.g. https://3000-<id>.e2b.app)
 *   while NEXT_PUBLIC_SERVER_URL still points to localhost, returns "" (same-origin
 *   relative URL) so requests route cleanly through Next.js /api/* rewrites.
 */
export function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    const { hostname } = window.location;
    const isLocalBrowser = hostname === "localhost" || hostname === "127.0.0.1";
    if (!isLocalBrowser && isLocalhostUrl(CONFIGURED_SERVER_URL)) {
      return "";
    }
  }
  return CONFIGURED_SERVER_URL;
}

/**
 * Resolves the Socket.IO server URL.
 * - On localhost, uses NEXT_PUBLIC_SERVER_URL (default http://localhost:4000).
 * - On proxied preview hosts (e.g. https://3000-<id>.e2b.app), maps to the
 *   corresponding port-4000 preview origin (https://4000-<id>.e2b.app) so
 *   native WebSocket connections work seamlessly.
 */
export function getSocketServerUrl(): string {
  if (typeof window !== "undefined") {
    const { hostname, protocol, origin } = window.location;
    const isLocalBrowser = hostname === "localhost" || hostname === "127.0.0.1";
    if (!isLocalBrowser && isLocalhostUrl(CONFIGURED_SERVER_URL)) {
      const e2bMatch = hostname.match(/^3000-(.+\.e2b\.app)$/i);
      if (e2bMatch) {
        return `${protocol}//4000-${e2bMatch[1]}`;
      }
      return origin;
    }
  }
  return CONFIGURED_SERVER_URL;
}
