/**
 * Which web pages may drive the bridge.
 *
 * A browser lets ANY website open a WebSocket to 127.0.0.1, so the bridge checks
 * the page's Origin header. Only these are accepted:
 *   - CutDesk on this computer, on its own ports (3000: dev server / `next start`,
 *     8304: the Docker copy). A random app on some other localhost port is refused.
 *   - the desktop app (Tauri)
 *   - anything listed in BRIDGE_ORIGINS, e.g. "http://192.168.1.10:8304"
 * Requests with no Origin (curl, scripts) are refused.
 */

export const DEFAULT_LOCAL_PORTS = [3000, 8304];

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const TAURI_HOSTS = new Set(["tauri.localhost"]);

/** Parse a BRIDGE_ORIGINS style list ("a, b c") into clean origins. */
export function parseOriginList(raw) {
  return new Set(
    String(raw ?? "")
      .split(/[\s,]+/)
      .map((o) => o.trim().replace(/\/$/, ""))
      .filter(Boolean),
  );
}

/**
 * @param {string | undefined} origin  the request's Origin header
 * @param {{ extraOrigins?: Set<string>, localPorts?: number[] }} [options]
 */
export function originAllowed(origin, { extraOrigins = new Set(), localPorts = DEFAULT_LOCAL_PORTS } = {}) {
  if (!origin || typeof origin !== "string") return false;
  if (extraOrigins.has(origin)) return true;
  let url;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  if (url.protocol === "tauri:") return true;
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (TAURI_HOSTS.has(url.hostname)) return true;
  if (!LOCAL_HOSTS.has(url.hostname)) return false;
  const port = Number(url.port || (url.protocol === "https:" ? 443 : 80));
  return localPorts.includes(port);
}
