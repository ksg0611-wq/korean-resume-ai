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

/** 1회 결제(4,900원)당 제공되는 자소서 생성/재생성 횟수 (Redis remainingGenerations 초기값) */
export const PAID_GENERATIONS = 3;

/** 면접 시뮬레이터 이용권 1회 결제당 활성 세션 수 (1개 세션 = 15문항 + 최대 45회 채점·꼬리질문) */
export const PAID_INTERVIEW_GENERATIONS = 1;

/** 면접 시뮬레이터 세션 최대 답변 채점·꼬리질문 한도 (질문 15개 × 3단계) */
export const INTERVIEW_MAX_EVALUATIONS = 45;

/** 면접 시뮬레이터 문항 구성 (유료 15문항 = 직무 10 + 공공기관 인성 5 / 무료 3문항) */
export const INTERVIEW_JOB_QUESTION_COUNT = 10;
export const INTERVIEW_PERSONALITY_QUESTION_COUNT = 5;
export const INTERVIEW_TOTAL_QUESTIONS =
  INTERVIEW_JOB_QUESTION_COUNT + INTERVIEW_PERSONALITY_QUESTION_COUNT;
export const INTERVIEW_FREE_QUESTION_COUNT = 3;

/** 유료 이용권 식별 키(order:*) Redis 보관 기간 (1년 = 31,536,000초) */
export const PAID_ORDER_TTL_SECONDS = 31_536_000;

/** 유료 생성 결과 재열람 링크 및 유료 면접 세션 보관 기간 (7일 = 604,800초) */
export const RESULT_TTL_DAYS = 7;
export const RESULT_TTL_SECONDS = RESULT_TTL_DAYS * 24 * 60 * 60;
export const INTERVIEW_PAID_SESSION_TTL_SECONDS = RESULT_TTL_SECONDS;

/** 미결제 미리보기 토큰(preview:*) 및 무료 면접 세션 보관 기간 (2시간 = 7,200초) */
export const PREVIEW_TTL_SECONDS = 7_200;
export const INTERVIEW_FREE_SESSION_TTL_SECONDS = PREVIEW_TTL_SECONDS;

/** 확정 가격 정책 (서버 검증 단일 기준) */
export const PRICING_PLANS = {
  resume_single: {
    id: "resume_single",
    price: 4900,
    label: "자소서 완성 패키지",
  },
  interview_single: {
    id: "interview_single",
    price: 4900,
    label: "공공기관 AI 면접 시뮬레이터 (15문항 · 45회 채점)",
  },
  bundle: {
    id: "bundle",
    price: 7900,
    label: "자소서 + 면접 통합 패키지",
  },
  interview_upgrade: {
    id: "interview_upgrade",
    price: 3000,
    label: "자소서 구매자 면접 시뮬레이터 업그레이드",
  },
} as const;

export const DEFAULT_INTERVIEW_JOB_CATEGORY = "공공기관 경영·회계·사무";

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

export const PAID_GENERATIONS_BREAKDOWN = `총 ${PAID_GENERATIONS}회(미리보기 해제 1회 + 재생성 ${PAID_GENERATIONS - 1}회)`;
export const PAID_BENEFIT_TEXT = `STAR 기반 ${PAID_GENERATIONS_BREAKDOWN} 포함`;
export const PAID_SUB_TEXT = `${PAID_GENERATIONS_BREAKDOWN}`;
export const PAID_INTERVIEW_BREAKDOWN = `15문항(직무10+인성5) · 최대 ${INTERVIEW_MAX_EVALUATIONS}회 채점·꼬리질문`;
export const PAID_INTERVIEW_BENEFIT_TEXT = `공공기관 NCS 15문항 + ${INTERVIEW_MAX_EVALUATIONS}회 답변 채점·꼬리질문 + 대비 노트 7일 보관`;
export const REFUND_SUMMARY_TEXT =
  "최초 생성 실패 시 자동 전액 환불, 면접 질문만 실패 시 무료 재시도";

/** AI 생성물 고지 문구 (웹 결과, .txt 다운로드, 결과 안내 이메일 공용 단일 기준) */
export const AI_DRAFT_REVIEW_NOTICE =
  "AI가 생성한 초안이며 제출 전 본인 검토가 필요합니다";

export function withAiDraftNoticeText(content: string): string {
  const trimmed = (content || "").trim();
  if (!trimmed) return content;
  if (trimmed.includes(AI_DRAFT_REVIEW_NOTICE)) return trimmed;
  return `※ 안내: ${AI_DRAFT_REVIEW_NOTICE}\n\n${trimmed}`;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim().toLowerCase();
  if (!trimmed || trimmed.length > 254 || !EMAIL_REGEX.test(trimmed)) {
    return null;
  }
  return trimmed;
}
