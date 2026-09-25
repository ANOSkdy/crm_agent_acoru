import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  outputFileTracingIncludes: {
    '/api/billing/**': ['./assets/fonts/NotoSansJP-Regular.ttf'],
    '/api/cron/billing': ['./assets/fonts/NotoSansJP-Regular.ttf'],
  },
};

export default nextConfig;
