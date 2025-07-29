// src/app/layout.tsx

import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import Header from "@/components/Header";

// 1. 기존 Geist 폰트 import 및 설정 코드 삭제

export const metadata: Metadata = {
  title: "리그오브레전드 - 바나나단",
  description: "바나나단!",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      {/* 2. className을 font-spiegel로 변경하고, 나머지 필요한 클래스 추가 */}
      <body className="font-spiegel bg-gray-900 text-white antialiased">
        <AuthProvider>
          <Header />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}