import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // --- 이미지 호스트 설정 추가 ---
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
  // --- 설정 추가 끝 ---
};

export default nextConfig;
