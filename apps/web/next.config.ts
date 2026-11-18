import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the dev server be opened through a Cloudflare quick tunnel.
  allowedDevOrigins: ['*.trycloudflare.com'],
  // Reports now live on the dashboard; keep old links and bookmarks working (the SSR page lives at /reports/ssr).
  async redirects() {
    return [{ source: '/reports', destination: '/dashboard', permanent: false }];
  },
};

export default nextConfig;
