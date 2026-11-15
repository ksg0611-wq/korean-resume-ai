/**
 * 사이트 전역 사업자 정보 · 정책 메타데이터 (단일 관리 지점)
 *
 * - 푸터, /about, /terms, /privacy, /refund 가 모두 이 파일을 참조합니다.
 * - 선택/미확정 항목(통신판매업 신고번호, 고객센터 연락처, 카카오톡 채널)은 환경변수로 주입합니다.
 *   Vercel 환경변수:
 *   - BUSINESS_MAIL_ORDER_NO
 *   - BUSINESS_CS_PHONE
 *   - BUSINESS_KAKAO_CHANNEL_URL (또는 NEXT_PUBLIC_KAKAO_CHANNEL_URL)
 * - 미설정 또는 공백 상태일 경우 자리표시자를 출력하지 않고 null을 반환하여 해당 항목을 렌더링하지 않습니다.
 */
export const SITE_URL = "https://korea-resume.com";

function cleanOptionalEnv(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export const BUSINESS_INFO = {
  serviceName: "Korea Resume AI",
  companyName: "에스지유닛",
  companyNameEn: "SG UNIT",
  representative: "김성근",
  businessRegistrationNo: "476-12-03191",
  mailOrderSalesNo: cleanOptionalEnv(process.env.BUSINESS_MAIL_ORDER_NO),
  address: "경상북도 예천군 호명읍 새움3로 7, 103동 501호",
  csPhone: cleanOptionalEnv(process.env.BUSINESS_CS_PHONE),
  kakaoChannelUrl: cleanOptionalEnv(
    process.env.BUSINESS_KAKAO_CHANNEL_URL || process.env.NEXT_PUBLIC_KAKAO_CHANNEL_URL
  ),
  email: "ksg0611@gmail.com",
} as const;

/** 약관·방침 시행일자 (개정 시 이 값만 갱신) */
export const POLICY_EFFECTIVE_DATE = "2026년 11월 15일";

export const POLICY_LINKS = [
  { href: "/about", label: "서비스 소개" },
  { href: "/terms", label: "이용약관" },
  { href: "/privacy", label: "개인정보처리방침" },
  { href: "/refund", label: "환불정책" },
] as const;
