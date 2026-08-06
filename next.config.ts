import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Vercel Blob — every uploaded image is served from here.
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      // YouTube thumbnails for trial-class videos.
      { protocol: "https", hostname: "img.youtube.com" },
      { protocol: "https", hostname: "i.ytimg.com" },
    ],
  },
  experimental: {
    serverActions: {
      // Gallery uploads accept several 10 MB images in one submission; the
      // default 1 MB body limit would reject them.
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
