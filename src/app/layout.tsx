// src/app/layout.tsx

import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import Header from "@/components/Header";

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
      <body className="font-spiegel bg-gray-900 text-white antialiased">
        <AuthProvider>
          <Header />
          <main>
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}


// 채팅창 기능포함한 레이아웃 (예비)
// // src/app/layout.tsx

// import type { Metadata } from "next";
// import "./globals.css";
// import { AuthProvider } from "@/components/AuthProvider";
// import Header from "@/components/Header";
// // import ChatPanel from "@/components/ChatPanel"; // ChatPanel 컴포넌트 import

// export const metadata: Metadata = {
//   title: "리그오브레전드 - 바나나단",
//   description: "바나나단!",
// };

// export default function RootLayout({
//   children,
// }: Readonly<{
//   children: React.ReactNode;
// }>) {
//   return (
//     <html lang="ko">
//       <body className="font-spiegel bg-gray-900 text-white antialiased">
//         <AuthProvider>
//           <div className="flex h-screen">
//             <div className="flex-1 flex flex-col overflow-hidden">
//               <Header />
//               <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-900">
//                 {children}
//               </main>
//             </div>
//             {/* ChatPanel을 레이아웃 오른쪽에 추가 */}
//             <ChatPanel />
//           </div>
//         </AuthProvider>
//       </body>
//     </html>
//   );
// }
