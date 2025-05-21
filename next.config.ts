import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Ignore ESLint during builds in production
    ignoreDuringBuilds: true,
  },
  // Remove Webpack configuration since we're using Turbopack
  // and move Turbopack configuration to the root level
  turbopack: {
    // Empty configuration to explicitly use Turbopack without Webpack
  },
  devIndicators: {
    position: 'bottom-left',
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Permissions-Policy',
            value: 'geolocation=(self), microphone=()'
          },
        ],
      },
    ];
  },
  reactStrictMode: true,
};

export default nextConfig;
