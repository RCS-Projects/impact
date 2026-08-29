/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  env: {
    GIT_COMMIT: process.env.GIT_COMMIT || 'unknown',
    BUILD_TIME: process.env.BUILD_TIME || new Date().toISOString(),
  },
};

export default nextConfig;
