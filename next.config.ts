import type { NextConfig } from "next";

// Two special build modes, each turned on by an env var; the normal web/Netlify
// build (neither set) is unchanged:
//   NEXT_OUTPUT_EXPORT=1 → static export for the Tauri desktop bundle.
//   DOCKER_STANDALONE=1  → self-contained server build for a small Docker image.
const exporting = process.env.NEXT_OUTPUT_EXPORT === "1";
const standalone = process.env.DOCKER_STANDALONE === "1";
const output = exporting ? "export" : standalone ? "standalone" : undefined;

// Who may show CutDesk inside a frame: itself, plus the House of Stix control
// room when CONTROL_ROOM_ORIGIN is set at build time (Docker passes it as a
// build arg). Any other site is refused, so it can't be clickjacked.
const frameAncestors = ["'self'", ...(process.env.CONTROL_ROOM_ORIGIN ?? "").split(/[\s,]+/).filter((o) => /^https?:\/\/[^\s'";]+$/.test(o))].join(" ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: `frame-ancestors ${frameAncestors}; object-src 'none'; base-uri 'self'` },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  // Headers don't apply to a static export (the desktop app has no server).
  ...(exporting ? {} : { headers: async () => [{ source: "/:path*", headers: securityHeaders }] }),
  cacheComponents: !exporting,
  partialPrefetching: !exporting,
  ...(output ? { output } : {}),
  ...(exporting ? { images: { unoptimized: true } } : {}),
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
