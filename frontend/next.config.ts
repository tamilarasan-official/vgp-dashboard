import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image (Dokploy).
  output: 'standalone',
  poweredByHeader: false,
  experimental: {
    // Tally / feedback uploads go through a server action (files up to 15 MB).
    serverActions: { bodySizeLimit: '20mb' },
  },
};

export default nextConfig;
