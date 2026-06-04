import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Shared workspace packages ship as TypeScript source; Next must transpile them.
  transpilePackages: ["@saral/core", "@saral/tokens"],
  // Allow the dev server to be opened from a phone on the LAN (otherwise Next 16
  // degrades cross-origin dev requests and the page won't hydrate / stay
  // interactive when accessed via the machine's IP). Add your machine's LAN IP.
  allowedDevOrigins: ["192.168.1.2"],
};

export default nextConfig;
