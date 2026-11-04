import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Kubernetes image (Aspire's AddNextJsApp) runs .next/standalone/server.js; next dev ignores it.
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "example.com" },
    ],
  },
};

export default nextConfig;
