import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Server-side video rendering: these use native binaries, a headless browser and
  // webpack at runtime, so Node loads them directly instead of bundling them.
  serverExternalPackages: ["@remotion/bundler", "@remotion/renderer", "@remotion/compositor-darwin-arm64"],
  partialPrefetching: true,
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
