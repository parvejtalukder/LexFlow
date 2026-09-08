/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['100.115.92.194'],

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },

  async rewrites() {
    return [
      {
        source: '/api/upload',
        destination: 'http://72.61.17.107/api/upload',
      },
      {
        source: '/uploads/:path*',
        destination: 'http://72.61.17.107/uploads/:path*',
      },
    ];
  },
};

export default nextConfig;