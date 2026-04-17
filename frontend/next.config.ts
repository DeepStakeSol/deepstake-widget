import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // images: {
  //   remotePatterns: [
  //         {
  //           protocol: 'https',
  //           hostname: 'freebiehive.com',
  //           port: '',
  //           pathname: '/wp-content/uploads/2024/03/**',
  //         },
  //         //new URL('https://freebiehive.com/wp-content/uploads/2024/03/**'), // Using URL constructor
  //       ],
  // },
  swcMinify: false,
};

export default nextConfig;
