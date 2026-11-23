import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a second dev server run from this folder (e.g. a shared instance) without clashing on .next.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  // Lets the dev server be opened through a Cloudflare quick tunnel.
  allowedDevOrigins: ['*.trycloudflare.com', '*.lhr.life', '*.app.lhr.life'],
  // Reports now live on the dashboard; keep old links and bookmarks working (the SSR page lives at /reports/ssr).
  async redirects() {
    return [{ source: '/reports', destination: '/dashboard', permanent: false }];
  },
};

export default nextConfig;
