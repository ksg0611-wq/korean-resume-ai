import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  metadataBase: new URL('https://korea-resume.com'),
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
        <header className="w-full bg-white border-b border-gray-200">
          <div className="max-w-4xl mx-auto px-6 py-4 flex justify-between items-center">
            <Link href="/" className="font-bold text-gray-900 text-lg">Korea Resume AI</Link>
            <nav>
              <Link href="/blog" className="text-gray-600 hover:text-gray-900 font-medium text-sm">취업 꿀팁 블로그</Link>
            </nav>
          </div>
        </header>
        {children}
        <Footer />
      </body>
    </html>
  );
}
