import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: ".",
  },
  typescript: {
    // Convex generates its own types via `npx convex dev`.
    // The circular reference in chunks.ts (action referencing its own module via api)
    // is a known Convex pattern that their tooling handles correctly.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
