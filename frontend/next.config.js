/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for @cloudflare/next-on-pages
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
