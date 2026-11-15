/**
 * 무료 체험 / 유료 이용권 횟수 단일 기준 (Single Source of Truth)
 *
 * - API 라우트의 Redis 레이트리밋(실제 차단 기준)과 UI 문구·FAQ·결제 상품명이 모두 이 값을 참조합니다.
 * - 값을 바꾸면 서버 제한과 화면 문구가 함께 바뀌어 불일치가 발생하지 않습니다.
 */
export const FREE_LIMITS = {
  /** /api/generate (자소서) IP당 무료 생성 횟수 */
  resume: 2,
  /** /api/interview/generate (면접 꼬리질문) IP당 무료 생성 횟수 */
  interview: 1,
} as const;

/** 무료 체험 슬라이딩 윈도우 (Upstash Ratelimit 형식) */
export const FREE_LIMIT_WINDOW = "24 h" as const;

/** 1회 결제(4,900원)당 제공되는 생성/재생성 횟수 (Redis remainingGenerations 초기값) */
export const PAID_GENERATIONS = 3;

/** 유료 이용권 식별 키(order:*) Redis 보관 기간 (1년 = 31,536,000초) */
export const PAID_ORDER_TTL_SECONDS = 31_536_000;

/** 유료 생성 결과 재열람 링크 Redis 보관 기간 (7일 = 604,800초) */
export const RESULT_TTL_DAYS = 7;
export const RESULT_TTL_SECONDS = RESULT_TTL_DAYS * 24 * 60 * 60;

/** 미결제 미리보기 토큰(preview:*) 및 주문 매핑 Redis 보관 기간 (2시간 = 7,200초) */
export const PREVIEW_TTL_SECONDS = 7_200;

/** 표준 자소서 4문항 구조 (P1.4 전 문항 일괄 생성 및 부분 공개 기준) */
export const STANDARD_RESUME_QUESTIONS = [
  { id: "q1", order: 1, title: "1. 지원동기 및 기관 이해", targetChars: 500 },
  { id: "q2", order: 2, title: "2. 직무역량 및 문제해결 경험", targetChars: 500 },
  { id: "q3", order: 3, title: "3. 협업·갈등 해결 경험", targetChars: 500 },
  { id: "q4", order: 4, title: "4. 입사 후 포부 및 발전 계획", targetChars: 500 },
] as const;

export type FreeLimitKind = keyof typeof FREE_LIMITS;

export function freeLimitButtonText(kind: FreeLimitKind): string {
  return `먼저 무료로 생성하기 (일 ${FREE_LIMITS[kind]}회 제한)`;
}

export function freeLimitExceededMessage(kind: FreeLimitKind): string {
  return `무료 생성 횟수(일 ${FREE_LIMITS[kind]}회)가 초과되었습니다.`;
}

export const PAID_BENEFIT_TEXT = `STAR 기반 ${PAID_GENERATIONS}회 생성/재생성 포함`;
export const PAID_SUB_TEXT = `${PAID_GENERATIONS}회 포함`;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim().toLowerCase();
  if (!trimmed || trimmed.length > 254 || !EMAIL_REGEX.test(trimmed)) {
    return null;
  }
  return trimmed;
}
