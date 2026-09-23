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

};

export default nextConfig;