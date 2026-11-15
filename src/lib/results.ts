import { requireRedisCredentials } from "@/lib/redisConfig";

export type ServiceType = "resume" | "interview";
export type PlanType =
  | "resume_single"
  | "interview_single"
  | "bundle"
  | "interview_upgrade";
export type OrderStatus =
  | "paid"
  | "generating"
  | "done"
  | "interview_pending"
  | "refunded"
  | "refund_failed"
  | "failed";

export interface OrderRecord {
  orderId: string;
  serviceType: ServiceType;
  planType?: PlanType;
  paymentKey: string;
  amount: number;
  email?: string | null;
  receiptUrl?: string | null;
  paid: boolean;
  status: OrderStatus;
  totalGenerations: number;
  remainingGenerations: number;
  usedCount: number;
  paidAt: string;
  generatingAt?: string | null;
  generatingAtMs?: number | null;
  generatingLockToken?: string | null;
  reservedGeneration?: boolean;
  doneAt?: string | null;
  failedAt?: string | null;
  refundedAt?: string | null;
  updatedAt: string;
  usedModel?: string | null;
  lastError?: string | null;
  refundAmount?: number | null;
  refundTransactionKey?: string | null;
  refundReason?: string | null;
  resultTokenHash?: string | null;
  resultExpiresAt?: string | null;
  activeSessionId?: string | null;
  verified?: boolean;
}

export interface ResumeQuestionItem {
  id: string;
  order: number;
  title: string;
  body: string;
  charCount: number;
  byteCount: number;
}

export interface LockedResumeQuestionItem {
  id: string;
  order: number;
  title: string;
  targetChars: number;
  charCount: number;
  byteCount: number;
  isLocked: true;
}

export interface InterviewQuestionItem {
  number: number;
  category: string;
  question: string;
  intent: string;
  answerTip: string;
}

export interface PreviewRecord {
  previewToken: string;
  jobTitle: string;
  memo: string;
  items: ResumeQuestionItem[];
  usedModel: string;
  thinkingLevel: string;
  createdAt: string;
  expiresAt: string;
}

export interface InterviewPrepFollowUpNote {
  depth: 1 | 2 | 3;
  ncsCompetency: string;
  focus: string;
  question: string;
  userAnswer?: string | null;
  totalScore?: number | null;
  consistencyLabel?: string | null;
  consistencyReason?: string | null;
  feedback3Lines?: string[];
  digPoint?: string | null;
  modelAnswer?: string | null;
}

export interface InterviewPrepNoteEntry {
  questionId: string;
  number: number;
  kind: "job" | "personality";
  ncsCompetency: string;
  intentSummary: string;
  question: string;
  userAnswer?: string | null;
  totalScore?: number | null;
  consistencyApplied?: boolean;
  consistencyLabel?: string | null;
  consistencyReason?: string | null;
  feedback3Lines?: string[];
  digPoint?: string | null;
  modelAnswer?: string | null;
  followUps: InterviewPrepFollowUpNote[];
}

export interface InterviewPrepNote {
  sessionId: string;
  jobCategory: string;
  totalQuestions: number;
  answeredCount: number;
  maxEvaluations: number;
  usedEvaluations: number;
  remainingEvaluations: number;
  updatedAt: string;
  entries: InterviewPrepNoteEntry[];
}

export interface StoredResultRecord {
  orderId: string;
  serviceType: ServiceType;
  token: string;
  tokenHash: string;
  title: string;
  text: string;
  receiptUrl: string | null;
  createdAt: string;
  expiresAt: string;
  items?: ResumeQuestionItem[];
  interviewQuestions?: InterviewQuestionItem[];
  interviewPending?: boolean;
  interviewError?: string | null;
  interviewSessionId?: string | null;
  interviewNote?: InterviewPrepNote | null;
  jobTitle?: string | null;
  sourceMemo?: string | null;
}

export function getOrderKey(orderId: string, serviceType: ServiceType): string {
  return serviceType === "interview" ? `order:interview:${orderId}` : `order:${orderId}`;
}

export function getResultKey(orderId: string): string {
  return `result:${orderId}`;
}

export function getPreviewKey(previewToken: string): string {
  return `preview:${previewToken}`;
}

export function getOrderPreviewKey(orderId: string): string {
  return `order_preview:${orderId}`;
}

export function buildResultUrl(orderId: string, token: string): string {
  return `/result/${encodeURIComponent(orderId)}?token=${encodeURIComponent(token)}`;
}

/**
 * 추측 불가능한 192-bit 보안 토큰 생성 (Edge / Node 공용)
 */
export function generateSecureToken(): string {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/**
 * SHA-256 해시 (Edge / Node 공용)
 */
export async function hashResultToken(token: string): Promise<string> {
  const encoded = new TextEncoder().encode(token);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoded);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * 상수 시간 문자열 비교 (타이밍 공격 방지, Edge / Node 공용)
 */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  const maxLen = Math.max(aBytes.length, bBytes.length);
  let diff = aBytes.length ^ bBytes.length;
  for (let i = 0; i < maxLen; i++) {
    const x = i < aBytes.length ? aBytes[i] : 0;
    const y = i < bBytes.length ? bBytes[i] : 0;
    diff |= x ^ y;
  }
  return diff === 0;
}

function parseRedisJson<T>(raw: unknown): T | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }
  if (typeof raw === "object") {
    return raw as T;
  }
  return null;
}

/**
 * Edge Runtime 호환 Upstash REST MGET 호출 (process.version 참조 제거)
 */
async function edgeRedisMGet(keys: string[]): Promise<unknown[]> {
  const creds = requireRedisCredentials();
  const res = await fetch(creds.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(["MGET", ...keys]),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Upstash REST MGET failed with HTTP ${res.status}`);
  }

  const json = (await res.json()) as { result?: unknown[]; error?: string };
  if (json.error) {
    throw new Error(`Upstash REST error: ${json.error}`);
  }
  return Array.isArray(json.result) ? json.result : [];
}

export async function findOrderById(orderId: string): Promise<{
  orderKey: string;
  order: OrderRecord;
} | null> {
  const resumeKey = getOrderKey(orderId, "resume");
  const interviewKey = getOrderKey(orderId, "interview");

  const [rawResume, rawInterview] = await edgeRedisMGet([resumeKey, interviewKey]);
  const resumeOrder = parseRedisJson<OrderRecord>(rawResume);
  const interviewOrder = parseRedisJson<OrderRecord>(rawInterview);

  if (resumeOrder && typeof resumeOrder === "object") {
    return {
      orderKey: resumeKey,
      order: {
        ...resumeOrder,
        orderId: resumeOrder.orderId || orderId,
        serviceType: resumeOrder.serviceType || "resume",
      },
    };
  }

  if (interviewOrder && typeof interviewOrder === "object") {
    return {
      orderKey: interviewKey,
      order: {
        ...interviewOrder,
        orderId: interviewOrder.orderId || orderId,
        serviceType: interviewOrder.serviceType || "interview",
      },
    };
  }

  return null;
}

export type ResultLookupOutcome =
  | { status: 403; reason: string }
  | { status: 410; orderId: string; serviceType: ServiceType; expiredAt: string | null }
  | { status: 200; order: OrderRecord; result: StoredResultRecord };

/**
 * 결과 재열람 검증 (유효 200 / 잘못된·누락 토큰 403 / 7일 만료 410)
 */
export async function verifyAndGetStoredResult(
  orderId: string,
  token: string | null | undefined
): Promise<ResultLookupOutcome> {
  const cleanOrderId = orderId?.trim();
  const cleanToken = token?.trim();

  if (!cleanOrderId || !cleanToken) {
    return { status: 403, reason: "missing_token" };
  }

  const resumeKey = getOrderKey(cleanOrderId, "resume");
  const interviewKey = getOrderKey(cleanOrderId, "interview");
  const resultKey = getResultKey(cleanOrderId);

  const [rawResume, rawInterview, rawResult] = await edgeRedisMGet([
    resumeKey,
    interviewKey,
    resultKey,
  ]);

  const resumeOrder = parseRedisJson<OrderRecord>(rawResume);
  const interviewOrder = parseRedisJson<OrderRecord>(rawInterview);
  const order = resumeOrder
    ? { ...resumeOrder, orderId: resumeOrder.orderId || cleanOrderId, serviceType: resumeOrder.serviceType || ("resume" as const) }
    : interviewOrder
      ? { ...interviewOrder, orderId: interviewOrder.orderId || cleanOrderId, serviceType: interviewOrder.serviceType || ("interview" as const) }
      : null;

  if (!order) {
    return { status: 403, reason: "order_not_found" };
  }

  if (!order.resultTokenHash) {
    return { status: 403, reason: "result_not_generated" };
  }

  const candidateHash = await hashResultToken(cleanToken);
  if (!timingSafeEqualStrings(candidateHash, order.resultTokenHash)) {
    return { status: 403, reason: "invalid_token" };
  }

  const result = parseRedisJson<StoredResultRecord>(rawResult);
  const expiresAtStr = result?.expiresAt || order.resultExpiresAt || null;
  const expiresAtMs = expiresAtStr ? Date.parse(expiresAtStr) : NaN;
  const isExpiredByTime = Number.isFinite(expiresAtMs) && Date.now() > expiresAtMs;

  if (!result || isExpiredByTime) {
    return {
      status: 410,
      orderId: cleanOrderId,
      serviceType: order.serviceType || "resume",
      expiredAt: expiresAtStr,
    };
  }

  return {
    status: 200,
    order,
    result,
  };
}
