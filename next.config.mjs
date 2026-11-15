/** @type {import('next').NextConfig} */
const RESULT_SECURITY_HEADERS = [
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Cache-Control', value: 'private, no-store' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
];

const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@electric-sql/pglite', 'pg']
  },
  async headers() {
    return [
      {
        source: '/result/:path*',
        headers: RESULT_SECURITY_HEADERS,
      },
      {
        source: '/api/result/:path*',
        headers: RESULT_SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;

