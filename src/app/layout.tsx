import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  metadataBase: new URL('https://korea-resume.com'),
  title: "Korea Resume AI",
  description: "STAR 프레임워크와 직무별 키워드 매핑 로직을 적용해 완벽한 자소서 초안을 만듭니다.",
  alternates: {
    canonical: 'https://korea-resume.com',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="flex flex-col min-h-screen">
        <header className="w-full bg-white border-b border-gray-200 sticky top-0 z-40">
          <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3.5 flex justify-between items-center">
            <Link href="/" className="font-bold text-gray-900 text-sm sm:text-xl tracking-tight flex items-center gap-1.5 shrink-0">
              <span className="w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full bg-blue-600"></span>
              <span className="hidden sm:inline">Korea Resume AI</span>
              <span className="sm:hidden font-extrabold text-xs">Korea Resume</span>
            </Link>
            <nav className="flex items-center gap-1.5 sm:gap-5 text-[11px] sm:text-sm font-medium shrink-0">
              <Link href="/" className="text-gray-700 hover:text-blue-600 transition-colors">
                자소서
              </Link>
              <Link href="/interview" className="text-gray-700 hover:text-blue-600 transition-colors">
                면접
              </Link>
              <Link href="/jobs" className="text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-0.5 transition-colors">
                <span>채용공고</span>
                <span className="text-[8px] sm:text-[10px] bg-blue-100 text-blue-700 font-bold px-1 py-0.2 rounded-full leading-none">New</span>
              </Link>
              <Link href="/blog" className="text-gray-700 hover:text-blue-600 transition-colors">
                블로그
              </Link>
            </nav>
          </div>
        </header>
        {children}
        <Footer />
      </body>
    </html>
  );
}
