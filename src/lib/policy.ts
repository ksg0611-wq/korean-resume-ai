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
