import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import type { NextConfig } from 'next';
import { webConfig } from './src/config';
import { webSecurityHeaders } from './src/security-headers';

const envPath = resolve(process.cwd(), '../../.env');
if (existsSync(envPath)) loadEnvFile(envPath);
const serverConfig = webConfig();
const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: resolve(process.cwd(), '../..'),
  poweredByHeader: false,
  reactStrictMode: true,
  // Root AGENTS.md owns repository rules; do not generate competing local files.
  agentRules: false,
  rewrites: async () => [
    {
      source: '/api/v1/:path*',
      destination: `${serverConfig.apiUrl}/api/v1/:path*`,
    },
  ],
  headers: async () => [
    {
      source: '/:path*',
      headers: webSecurityHeaders(
        process.env.NEXT_PUBLIC_MAP_STYLE_URL,
        process.env.S3_ENDPOINT,
      ),
    },
  ],
};
export default config;
