import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '../..');
// Single .env.local at the repo root is shared by all apps.
loadEnvConfig(repoRoot);

const nextConfig: NextConfig = {
  transpilePackages: ['@gnj/core'],
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
  poweredByHeader: false,
  images: { unoptimized: true },
};

export default nextConfig;
