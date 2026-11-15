import Link from "next/link";
import { BUSINESS_INFO, POLICY_LINKS } from "@/lib/siteConfig";

/**
 * 서버 컴포넌트 푸터.
 * 사업자 정보는 src/lib/siteConfig.ts 한 곳에서 관리하며,
 * 미설정 환경변수 항목(통신판매업 신고번호·고객센터 연락처·카카오톡 채널)은 자리표시자 없이 미렌더링합니다.
 */
export default function Footer() {
  const b = BUSINESS_INFO;

  return (
    <footer className="w-full bg-white border-t border-gray-200 mt-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-center md:text-left text-gray-500 text-sm leading-relaxed">
            <p className="font-semibold text-gray-700 mb-1">
              {`상호: ${b.companyName} (${b.companyNameEn}) | 대표자명: ${b.representative}`}
            </p>
            <p>{`사업자등록번호: ${b.businessRegistrationNo}`}</p>
            {b.mailOrderSalesNo && <p>{`통신판매업 신고번호: ${b.mailOrderSalesNo}`}</p>}
            <p>{`주소: ${b.address}`}</p>
            <p>
              {b.csPhone ? `고객센터: ${b.csPhone} | 이메일: ${b.email}` : `이메일: ${b.email}`}
              {b.kakaoChannelUrl && (
                <>
                  {" | "}
                  <a
                    href={b.kakaoChannelUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-blue-600 transition"
                  >
                    카카오톡 채널
                  </a>
                </>
              )}
            </p>
          </div>

          <nav
            aria-label="약관 및 정책"
            className="flex flex-wrap justify-center gap-4 text-sm text-gray-600 mt-4 md:mt-0"
          >
            {POLICY_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`hover:text-blue-600 transition ${link.href === "/refund" ? "font-medium" : ""}`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="mt-8 text-center text-xs text-gray-400">
          © {new Date().getFullYear()} Korean Resume AI. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
