import type { Metadata } from "next";
import "./globals.css";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Korean Resume AI Tool",
  description: "STAR 프레임워크와 직무별 키워드 매핑 로직을 적용해 완벽한 자소서 초안을 만듭니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="flex flex-col min-h-screen">
        {children}
        <Footer />
      </body>
    </html>
  );
}
