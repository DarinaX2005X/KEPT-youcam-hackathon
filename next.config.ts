import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['sharp'],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [{ key: 'Permissions-Policy', value: 'camera=(self)' }],
      },
    ];
  },
};

export default nextConfig;
