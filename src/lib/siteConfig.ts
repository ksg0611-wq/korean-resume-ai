/**
 * 사이트 전역 사업자 정보 · 정책 메타데이터 (단일 관리 지점)
 *
 * - 푸터, /about, /terms, /privacy, /refund 가 모두 이 파일을 참조합니다.
 * - 아직 확정되지 않은 값(통신판매업 신고번호, 고객센터 연락처)은 환경변수로 주입합니다.
 *   Vercel 환경변수: BUSINESS_MAIL_ORDER_NO, BUSINESS_CS_PHONE  (설정 후 재배포 필요)
 *   미설정 시 아래 대괄호 자리표시자가 그대로 노출되므로, 심사 신청 전 반드시 실제 값으로 교체하세요.
 */
export const SITE_URL = "https://korea-resume.com";

export const BUSINESS_INFO = {
  serviceName: "Korea Resume AI",
  companyName: "에스지유닛",
  companyNameEn: "SG UNIT",
  representative: "김성근",
  businessRegistrationNo: "476-12-03191",
  mailOrderSalesNo: process.env.BUSINESS_MAIL_ORDER_NO || "[통신판매업 신고번호]",
  address: "경상북도 예천군 호명읍 새움3로 7, 103동 501호",
  csPhone: process.env.BUSINESS_CS_PHONE || "[고객센터 연락처]",
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
