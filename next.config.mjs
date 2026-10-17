/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

const r2 = 'https://*.r2.cloudflarestorage.com https://*.r2.dev';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    // geolocation is allowed for the optional "use my location" project geotag (browser prompt).
    value: 'camera=(self), microphone=(), geolocation=(self)',
  },
  ...(isProd
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]
    : []),
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      `img-src 'self' data: blob: ${r2}`,
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
      "font-src 'self' data:",
      `connect-src 'self' ${r2}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // Native/WASM image tooling must stay out of the server bundle and be required from node_modules
  // at runtime (sharp ships a libvips binary; heic-convert loads a WASM decoder).
  serverExternalPackages: ['sharp', 'heic-convert'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
