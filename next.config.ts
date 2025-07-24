import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // 기존 Firebase Storage 설정
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        port: '',
        pathname: '/**',
      },
      // --- 새로 추가된 라이엇 Data Dragon 설정 ---
      {
        protocol: 'http',
        hostname: 'ddragon.leagueoflegends.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
