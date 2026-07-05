import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Required by docker/Dockerfile.app — the prod stage runs the self-contained
  // .next/standalone output instead of the full node_modules tree.
  output: 'standalone'
};

export default nextConfig;
