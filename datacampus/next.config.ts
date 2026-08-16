import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // @resvg/resvg-js ships a native (.node) binary for SVG->PNG rasterization
  // (used to render the Use Case diagram template) — it must be excluded
  // from webpack bundling so the native addon is loaded from node_modules
  // at runtime instead of being bundled incorrectly.
  serverExternalPackages: ['@resvg/resvg-js'],
};

export default nextConfig;
