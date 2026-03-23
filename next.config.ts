import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * allowedDevOrigins — permits cross-origin requests from 127.0.0.1 in dev.
   *
   * The Spotify OAuth redirect URI points to http://127.0.0.1:3000, but the
   * Next.js dev server binds to localhost:3000. When the browser navigates
   * from 127.0.0.1 back to localhost (the token-bridging redirect), Next.js
   * treats the request as cross-origin and blocks it by default in dev mode.
   * Adding "127.0.0.1" here tells the dev server to accept these requests.
   *
   * This setting has no effect in production builds.
   */
  allowedDevOrigins: ["127.0.0.1"],

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.scdn.co", // Spotify album art CDN
      },
    ],
  },
};

export default nextConfig;
