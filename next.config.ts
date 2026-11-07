import type { NextConfig } from "next";

// Two special build modes, each turned on by an env var; the normal web/Netlify
// build (neither set) is unchanged:
//   NEXT_OUTPUT_EXPORT=1 → static export for the Tauri desktop bundle.
//   DOCKER_STANDALONE=1  → self-contained server build for a small Docker image.
const exporting = process.env.NEXT_OUTPUT_EXPORT === "1";
const standalone = process.env.DOCKER_STANDALONE === "1";
const output = exporting ? "export" : standalone ? "standalone" : undefined;

const nextConfig: NextConfig = {
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
