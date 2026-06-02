import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Shared workspace packages ship as TypeScript source; Next must transpile them.
  transpilePackages: ["@saral/core", "@saral/tokens"],
};

export default nextConfig;
