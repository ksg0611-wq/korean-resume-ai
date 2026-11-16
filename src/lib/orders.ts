import {
  PAID_GENERATIONS,
  PAID_INTERVIEW_GENERATIONS,
  PAID_ORDER_TTL_SECONDS,
  PREVIEW_TTL_SECONDS,
  RESULT_TTL_SECONDS,
  normalizeEmail,
} from "@/lib/policy";
import { requireRedisClient } from "@/lib/redis";
import {
  buildResultUrl,
  findOrderById,
  generateSecureToken,
  getOrderKey,
  getOrderPreviewKey,
  getPreviewKey,
  getResultKey,
  hashResultToken,
  timingSafeEqualStrings,
  type InterviewPrepNote,
  type InterviewQuestionItem,
  type OrderRecord,
  type PlanType,
  type PreviewRecord,
  type ResumeQuestionItem,
  type ServiceType,
  type StoredResultRecord,
} from "@/lib/results";

export function getInitialGenerationsForService(serviceType: ServiceType): number {
  return serviceType === "interview" ? PAID_INTERVIEW_GENERATIONS : PAID_GENERATIONS;
}
import { cancelTossPayment, type TossCancelResult } from "@/lib/toss";
import { sanitizeErrorText } from "@/lib/alerts";

export const ORDER_INDEX_KEY = "orders:index";
export const GENERATING_STALE_MS = 180_000;
export const GENERATING_LOCK_TTL_SECONDS = 180;

export function getOrderLockKey(orderKey: string): string {
  return `lock:${orderKey}`;
}

const BEGIN_GENERATION_LUA = `
local rawStr = redis.call("GET", KEYS[1])
if not rawStr then
  return cjson.encode({
    ok = false,
    status = 403,
    code = "INVALID_ORDER",
    message = "Forbidden. Invalid payment info or generations exhausted."
  })
end

local okDecode, order = pcall(cjson.decode, rawStr)
if not okDecode or type(order) ~= "table" then
  return cjson.encode({
    ok = false,
    status = 403,
    code = "INVALID_ORDER",
    message = "Forbidden. Invalid payment info or generations exhausted."
  })
end

if order.status == "refunded" then
  return cjson.encode({
    ok = false,
    status = 403,
    code = "ORDER_REFUNDED",
    message = "이미 자동 환불 처리되어 무효화된 주문입니다."
  })
end

if order.status == "refund_failed" then
  return cjson.encode({
    ok = false,
    status = 409,
    code = "REFUND_PENDING",
    message = "환불 처리 중입니다(영업일 기준 1~2일 내 처리). 지연 시 고객센터로 문의해 주세요."
  })
end

if order.paid ~= true then
  return cjson.encode({
    ok = false,
    status = 403,
    code = "GENERATIONS_EXHAUSTED",
    message = "Forbidden. Invalid payment info or generations exhausted."
  })
end

local nowIso = ARGV[1]
local nowMs = tonumber(ARGV[2])
local staleMs = tonumber(ARGV[3])
local lockTtlSeconds = tonumber(ARGV[4])
local lockToken = ARGV[5]
local defaultTotal = tonumber(ARGV[6])

local totalGenerations = tonumber(order.totalGenerations) or defaultTotal
local remaining = tonumber(order.remainingGenerations)
local usedCount = tonumber(order.usedCount)

local lockVal = redis.call("GET", KEYS[2])
local genAtMs = tonumber(order.generatingAtMs)
local elapsed = nil
if genAtMs then
  elapsed = nowMs - genAtMs
end

if lockVal ~= false then
  if not (order.status == "generating" and elapsed ~= nil and elapsed >= staleMs) then
    return cjson.encode({
      ok = false,
      status = 409,
      code = "GENERATION_IN_PROGRESS",
      message = "이미 AI 생성이 진행 중입니다. 잠시만 기다려 주세요."
    })
  end
elseif order.status == "generating" then
  if elapsed ~= nil and elapsed >= 0 and elapsed < staleMs then
    return cjson.encode({
      ok = false,
      status = 409,
      code = "GENERATION_IN_PROGRESS",
      message = "이미 AI 생성이 진행 중입니다. 잠시만 기다려 주세요."
    })
  end
end

-- Recover crashed generating slot if pre-decremented reservation never completed
if order.status == "generating" and order.reservedGeneration == true then
  if remaining == nil then
    remaining = 0
  end
  remaining = math.min(totalGenerations, remaining + 1)
  order.reservedGeneration = false
end

if remaining == nil or remaining < 1 then
  if order.status == "generating" then
    if usedCount ~= nil and usedCount > 0 then
      order.status = "done"
    else
      order.status = "paid"
    end
    order.generatingLockToken = cjson.null
    order.generatingAtMs = cjson.null
    order.reservedGeneration = false
    order.updatedAt = nowIso
    local ttl = redis.call("TTL", KEYS[1])
    if ttl and ttl > 0 then
      redis.call("SET", KEYS[1], cjson.encode(order), "EX", ttl)
    else
      redis.call("SET", KEYS[1], cjson.encode(order))
    end
    redis.call("DEL", KEYS[2])
  end
  return cjson.encode({
    ok = false,
    status = 403,
    code = "GENERATIONS_EXHAUSTED",
    message = "Forbidden. Invalid payment info or generations exhausted."
  })
end

if usedCount == nil then
  usedCount = math.max(0, totalGenerations - remaining)
end

order.orderId = order.orderId or ARGV[7]
order.serviceType = order.serviceType or ARGV[8]
order.paymentKey = order.paymentKey or ""
if type(order.amount) ~= "number" then
  order.amount = 4900
end
order.paid = true
order.status = "generating"
order.totalGenerations = totalGenerations
order.remainingGenerations = remaining - 1
order.reservedGeneration = true
order.usedCount = usedCount
order.paidAt = order.paidAt or nowIso
order.generatingAt = nowIso
order.generatingAtMs = nowMs
order.generatingLockToken = lockToken
order.updatedAt = nowIso

redis.call("SET", KEYS[2], lockToken, "EX", lockTtlSeconds)

local ttl = redis.call("TTL", KEYS[1])
local encoded = cjson.encode(order)
if ttl and ttl > 0 then
  redis.call("SET", KEYS[1], encoded, "EX", ttl)
else
  redis.call("SET", KEYS[1], encoded)
end

return cjson.encode({
  ok = true,
  order = order
})
`;

const SAVE_AND_RELEASE_LOCK_LUA = `
local currentLock = redis.call("GET", KEYS[2])
local expectedToken = ARGV[2]
local forceSave = ARGV[3]

if forceSave ~= "1" and currentLock ~= false and expectedToken ~= "" and currentLock ~= expectedToken then
  return 0
end

local ttl = redis.call("TTL", KEYS[1])
if ttl and ttl > 0 then
  redis.call("SET", KEYS[1], ARGV[1], "EX", ttl)
else
  redis.call("SET", KEYS[1], ARGV[1])
end

if expectedToken == "" or currentLock == expectedToken then
  redis.call("DEL", KEYS[2])
end
return 1
`;

async function persistOrderAndReleaseLock(options: {
  orderKey: string;
  order: OrderRecord;
  expectedLockToken?: string | null;
  forceSave?: boolean;
}): Promise<void> {
  const redis = requireRedisClient();
  const lockKey = getOrderLockKey(options.orderKey);
  await redis.eval(
    SAVE_AND_RELEASE_LOCK_LUA,
    [options.orderKey, lockKey],
    [
      JSON.stringify(options.order),
      options.expectedLockToken ?? "",
      options.forceSave ? "1" : "0",
    ]
  );
}

async function indexOrderKey(orderKey: string): Promise<void> {
  const redis = requireRedisClient();
  await redis.zadd(ORDER_INDEX_KEY, {
    score: Date.now(),
    member: orderKey,
  });
}

/**
 * 결제 승인 직후 주문 원장 기록 (status: "paid", 1년 TTL + 관리자 인덱스 등록)
 */
export async function saveConfirmedOrder(options: {
  orderId: string;
  serviceType: ServiceType;
  planType?: PlanType;
  paymentKey: string;
  amount: number;
  email?: string | null;
  receiptUrl?: string | null;
  baseOrderId?: string | null;
}): Promise<{ order: OrderRecord; alreadyConfirmed: boolean }> {
  const {
    orderId,
    serviceType,
    planType,
    paymentKey,
    amount,
    email,
    receiptUrl,
    baseOrderId,
  } = options;
  const redis = requireRedisClient();
  const orderKey = getOrderKey(orderId, serviceType);
  const existing = await redis.get<OrderRecord>(orderKey);

  // 동일 주문·동일 paymentKey 재요청 시 멱등 처리 (잔여 횟수·상태 초기화 방지)
  if (existing && existing.paymentKey === paymentKey) {
    return { order: existing, alreadyConfirmed: true };
  }

  const now = new Date().toISOString();
  const cleanEmail = normalizeEmail(email);
  const effectivePlanType: PlanType =
    planType ??
    (serviceType === "interview" ? "interview_single" : "resume_single");
  const initialGenerations = getInitialGenerationsForService(serviceType);
  const linkedInterviewOrderId =
    serviceType === "resume" && effectivePlanType === "bundle"
      ? `int_${orderId}`
      : null;

  const record: OrderRecord = {
    orderId,
    serviceType,
    planType: effectivePlanType,
    ...(baseOrderId ? { baseOrderId } : {}),
    ...(linkedInterviewOrderId ? { linkedInterviewOrderId } : {}),
    paymentKey,
    amount: Number.isFinite(amount) ? amount : 0,
    email: cleanEmail,
    receiptUrl: receiptUrl ?? null,
    paid: true,
    status: "paid",
    totalGenerations: initialGenerations,
    remainingGenerations: initialGenerations,
    usedCount: 0,
    paidAt: now,
    generatingAt: null,
    generatingAtMs: null,
    generatingLockToken: null,
    reservedGeneration: false,
    doneAt: null,
    failedAt: null,
    refundedAt: null,
    updatedAt: now,
    usedModel: null,
    lastError: null,
    refundAmount: null,
    refundTransactionKey: null,
    refundReason: null,
    resultTokenHash: null,
    resultExpiresAt: null,
    activeSessionId: null,
    ...(serviceType === "interview" ? { verified: true } : {}),
  };

  await redis.set(orderKey, record, { ex: PAID_ORDER_TTL_SECONDS });
  await indexOrderKey(orderKey);

  // 통합 패키지(7,900원): 별도 키 order:interview:int_{orderId} 연동 이용권 자동 발급
  if (linkedInterviewOrderId) {
    const companionKey = getOrderKey(linkedInterviewOrderId, "interview");
    const companionRecord: OrderRecord = {
      orderId: linkedInterviewOrderId,
      serviceType: "interview",
      planType: "bundle_companion",
      baseOrderId: orderId,
      paymentKey,
      amount: 0,
      email: cleanEmail,
      receiptUrl: receiptUrl ?? null,
      paid: true,
      status: "paid",
      totalGenerations: PAID_INTERVIEW_GENERATIONS,
      remainingGenerations: PAID_INTERVIEW_GENERATIONS,
      usedCount: 0,
      paidAt: now,
      generatingAt: null,
      generatingAtMs: null,
      generatingLockToken: null,
      reservedGeneration: false,
      doneAt: null,
      failedAt: null,
      refundedAt: null,
      updatedAt: now,
      usedModel: null,
      lastError: null,
      refundAmount: null,
      refundTransactionKey: null,
      refundReason: null,
      resultTokenHash: null,
      resultExpiresAt: null,
      activeSessionId: null,
      verified: true,
    };
    await redis.set(companionKey, companionRecord, { ex: PAID_ORDER_TTL_SECONDS });
    await indexOrderKey(companionKey);
  }

  // 자소서 구매자 업그레이드(+3,000원): 기준 자소서 주문 1회 업그레이드 완료 바인딩
  if (serviceType === "interview" && effectivePlanType === "interview_upgrade" && baseOrderId) {
    const baseKey = getOrderKey(baseOrderId, "resume");
    const baseOrder = await redis.get<OrderRecord>(baseKey);
    if (baseOrder && typeof baseOrder === "object") {
      const baseTtl = await redis.ttl(baseKey);
      const updatedBase: OrderRecord = {
        ...baseOrder,
        upgradedToInterviewOrderId: orderId,
        updatedAt: now,
      };
      await redis.set(baseKey, updatedBase, {
        ex: baseTtl > 0 ? baseTtl : PAID_ORDER_TTL_SECONDS,
      });
    }
  }

  return { order: record, alreadyConfirmed: false };
}

export type BeginGenerationResult =
  | { ok: true; orderKey: string; order: OrderRecord }
  | { ok: false; status: number; message: string; code: string };

type BeginGenerationLuaResult =
  | { ok: true; order: OrderRecord }
  | { ok: false; status: number; code: string; message: string };

/**
 * 유료 생성 시작 전 Redis Lua 원자 연산:
 * - 잔여 횟수 1회 선차감(예약) + status: "generating" 전이 + lock 키(TTL 180초) 설정
 * - 동시 요청은 즉시 409 Conflict 반환
 * - 180초 이상 고착된 generating 주문은 자동 복구 후 재시도 허용
 */
export async function beginPaidGeneration(options: {
  orderId: string;
  serviceType: ServiceType;
}): Promise<BeginGenerationResult> {
  const { orderId, serviceType } = options;
  const redis = requireRedisClient();
  const orderKey = getOrderKey(orderId, serviceType);
  const lockKey = getOrderLockKey(orderKey);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const lockToken = generateSecureToken();

  const defaultTotalGenerations = getInitialGenerationsForService(serviceType);

  const rawEval = await redis.eval<string[], string | BeginGenerationLuaResult>(
    BEGIN_GENERATION_LUA,
    [orderKey, lockKey],
    [
      nowIso,
      String(nowMs),
      String(GENERATING_STALE_MS),
      String(GENERATING_LOCK_TTL_SECONDS),
      lockToken,
      String(defaultTotalGenerations),
      orderId,
      serviceType,
    ]
  );

  const parsed: BeginGenerationLuaResult =
    typeof rawEval === "string"
      ? (JSON.parse(rawEval) as BeginGenerationLuaResult)
      : rawEval;

  if (!parsed || !parsed.ok) {
    return {
      ok: false,
      status: parsed?.status ?? 500,
      code: parsed?.code ?? "ORDER_LOCK_FAILED",
      message:
        parsed?.message ??
        "주문 상태를 확인하는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  await indexOrderKey(orderKey);
  return { ok: true, orderKey, order: parsed.order };
}

/**
 * 유료 생성 성공 처리: 횟수 차감 + usedCount 증가 + 7일 TTL 결과 재열람 키 저장 + status: "done"
 */
export async function completePaidGeneration(options: {
  orderKey: string;
  order: OrderRecord;
  title: string;
  text: string;
  usedModel: string;
  items?: ResumeQuestionItem[];
  interviewQuestions?: InterviewQuestionItem[];
  interviewPending?: boolean;
  interviewError?: string | null;
  interviewSessionId?: string | null;
  interviewNote?: InterviewPrepNote | null;
  jobTitle?: string | null;
  jobSn?: number | null;
  sourceMemo?: string | null;
}): Promise<{
  order: OrderRecord;
  resultToken: string;
  resultUrl: string;
  resultExpiresAt: string;
}> {
  const {
    orderKey,
    order,
    title,
    text,
    usedModel,
    items,
    interviewQuestions,
    interviewPending,
    interviewError,
    interviewSessionId,
    interviewNote,
    jobTitle,
    jobSn,
    sourceMemo,
  } = options;
  const redis = requireRedisClient();
  const resultKey = getResultKey(order.orderId);

  const nowDate = new Date();
  const nowIso = nowDate.toISOString();
  const expiresAtIso = new Date(nowDate.getTime() + RESULT_TTL_SECONDS * 1000).toISOString();

  // 기존 7일 재열람 토큰이 유효하면 동일 링크를 유지해 3회 재생성 중에도 기존 메일 링크가 깨지지 않게 함
  const existingResult = await redis.get<StoredResultRecord>(resultKey);
  let resultToken = existingResult?.token;
  let resultTokenHash = order.resultTokenHash || existingResult?.tokenHash;

  if (!resultToken || !resultTokenHash) {
    resultToken = generateSecureToken();
    resultTokenHash = await hashResultToken(resultToken);
  }

  const effectiveJobSn =
    typeof jobSn === "number" && jobSn > 0
      ? jobSn
      : typeof existingResult?.jobSn === "number" && existingResult.jobSn > 0
        ? existingResult.jobSn
        : null;

  const storedResult: StoredResultRecord = {
    orderId: order.orderId,
    serviceType: order.serviceType,
    ...(order.linkedInterviewOrderId
      ? { linkedInterviewOrderId: order.linkedInterviewOrderId }
      : {}),
    ...(effectiveJobSn ? { jobSn: effectiveJobSn } : {}),
    token: resultToken,
    tokenHash: resultTokenHash,
    title,
    text,
    receiptUrl: order.receiptUrl ?? null,
    createdAt: existingResult?.createdAt || nowIso,
    expiresAt: expiresAtIso,
    ...(items ? { items } : {}),
    ...(interviewQuestions ? { interviewQuestions } : {}),
    ...(typeof interviewPending === "boolean" ? { interviewPending } : {}),
    ...(interviewError !== undefined ? { interviewError } : {}),
    ...(interviewSessionId !== undefined ? { interviewSessionId } : {}),
    ...(interviewNote !== undefined ? { interviewNote } : {}),
    ...(jobTitle !== undefined ? { jobTitle } : {}),
    ...(sourceMemo !== undefined ? { sourceMemo } : {}),
  };

  await redis.set(resultKey, storedResult, { ex: RESULT_TTL_SECONDS });

  const lockToken = order.generatingLockToken ?? null;
  const remainingGenerations = order.reservedGeneration
    ? order.remainingGenerations
    : Math.max(0, order.remainingGenerations - 1);

  const updatedOrder: OrderRecord = {
    ...order,
    status: "done",
    usedCount: (order.usedCount ?? 0) + 1,
    remainingGenerations,
    reservedGeneration: false,
    generatingLockToken: null,
    generatingAtMs: null,
    doneAt: nowIso,
    updatedAt: nowIso,
    usedModel,
    lastError: null,
    resultTokenHash,
    resultExpiresAt: expiresAtIso,
    ...(interviewSessionId !== undefined ? { activeSessionId: interviewSessionId } : {}),
  };

  await persistOrderAndReleaseLock({
    orderKey,
    order: updatedOrder,
    expectedLockToken: lockToken,
  });
  await indexOrderKey(orderKey);

  return {
    order: updatedOrder,
    resultToken,
    resultUrl: buildResultUrl(order.orderId, resultToken),
    resultExpiresAt: expiresAtIso,
  };
}

const CONSUME_PREVIEW_LUA = `
local raw = redis.call("GET", KEYS[1])
if not raw then
  if KEYS[2] and KEYS[2] ~= "" then
    redis.call("DEL", KEYS[2])
  end
  return nil
end
redis.call("DEL", KEYS[1])
if KEYS[2] and KEYS[2] ~= "" then
  redis.call("DEL", KEYS[2])
end
return raw
`;

/**
 * 미결제 전 문항 미리보기 결과를 previewToken으로 Redis에 저장 (TTL 2시간 = 7,200초)
 */
export async function savePreviewRecord(options: {
  jobTitle: string;
  jobSn?: number | null;
  memo: string;
  items: ResumeQuestionItem[];
  usedModel: string;
  thinkingLevel: string;
}): Promise<PreviewRecord> {
  const redis = requireRedisClient();
  const previewToken = generateSecureToken();
  const nowDate = new Date();
  const record: PreviewRecord = {
    previewToken,
    jobTitle: options.jobTitle,
    ...(typeof options.jobSn === "number" && options.jobSn > 0
      ? { jobSn: options.jobSn }
      : {}),
    memo: options.memo,
    items: options.items,
    usedModel: options.usedModel,
    thinkingLevel: options.thinkingLevel,
    createdAt: nowDate.toISOString(),
    expiresAt: new Date(nowDate.getTime() + PREVIEW_TTL_SECONDS * 1000).toISOString(),
  };

  await redis.set(getPreviewKey(previewToken), record, { ex: PREVIEW_TTL_SECONDS });
  return record;
}

/**
 * 결제 직전 orderId <-> previewToken 매핑 기록 및 preview TTL 7,200초(2시간) 연장
 */
export async function linkOrderPreviewToken(options: {
  orderId: string;
  previewToken: string;
}): Promise<{ linked: boolean; previewExists: boolean; expiresAt: string | null }> {
  const cleanOrderId = options.orderId.trim();
  const cleanPreviewToken = options.previewToken.trim();
  if (!cleanOrderId || !cleanPreviewToken) {
    return { linked: false, previewExists: false, expiresAt: null };
  }

  const redis = requireRedisClient();
  const previewKey = getPreviewKey(cleanPreviewToken);
  const existing = await redis.get<PreviewRecord>(previewKey);

  if (!existing) {
    return { linked: false, previewExists: false, expiresAt: null };
  }

  const refreshedExpiresAt = new Date(
    Date.now() + PREVIEW_TTL_SECONDS * 1000
  ).toISOString();
  const refreshed: PreviewRecord = {
    ...existing,
    expiresAt: refreshedExpiresAt,
  };

  await redis.set(previewKey, refreshed, { ex: PREVIEW_TTL_SECONDS });
  await redis.set(
    getOrderPreviewKey(cleanOrderId),
    {
      orderId: cleanOrderId,
      previewToken: cleanPreviewToken,
      linkedAt: new Date().toISOString(),
      expiresAt: refreshedExpiresAt,
    },
    { ex: PREVIEW_TTL_SECONDS }
  );

  return { linked: true, previewExists: true, expiresAt: refreshedExpiresAt };
}

/**
 * 주문에 매핑된 previewToken 1회성 원자적 조회 및 소비(DEL)
 */
export async function consumePreviewForOrder(options: {
  orderId: string;
  previewToken?: string | null;
}): Promise<PreviewRecord | null> {
  const cleanOrderId = options.orderId.trim();
  const redis = requireRedisClient();
  const orderPreviewKey = getOrderPreviewKey(cleanOrderId);

  let targetToken = options.previewToken?.trim() || "";
  if (!targetToken) {
    const mapped = await redis.get<{ previewToken?: string }>(orderPreviewKey);
    if (mapped && typeof mapped.previewToken === "string") {
      targetToken = mapped.previewToken.trim();
    }
  }

  if (!targetToken) {
    return null;
  }

  const previewKey = getPreviewKey(targetToken);
  const raw = await redis.eval<string[], PreviewRecord | string | null>(
    CONSUME_PREVIEW_LUA,
    [previewKey, orderPreviewKey],
    []
  );

  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as PreviewRecord;
    } catch {
      return null;
    }
  }
  return raw;
}

/**
 * 저장된 유료 결과(result:*) 단건 조회 (면접 질문 재시도용)
 */
export async function getStoredResultForOrder(
  orderId: string
): Promise<StoredResultRecord | null> {
  const redis = requireRedisClient();
  const result = await redis.get<StoredResultRecord>(getResultKey(orderId));
  return result && typeof result === "object" ? result : null;
}

/**
 * Branch A/부분 실패 시 추가 횟수 차감 없이 10개 면접 질문만 저장 업데이트
 */
export async function updateOrderInterviewQuestions(options: {
  orderId: string;
  interviewQuestions: InterviewQuestionItem[];
  text?: string;
}): Promise<StoredResultRecord | null> {
  const redis = requireRedisClient();
  const resultKey = getResultKey(options.orderId);
  const existing = await redis.get<StoredResultRecord>(resultKey);
  if (!existing) return null;

  const expiresMs = Date.parse(existing.expiresAt);
  const remainingTtl = Number.isFinite(expiresMs)
    ? Math.max(60, Math.floor((expiresMs - Date.now()) / 1000))
    : RESULT_TTL_SECONDS;

  const updated: StoredResultRecord = {
    ...existing,
    interviewQuestions: options.interviewQuestions,
    interviewPending: false,
    interviewError: null,
    ...(options.text ? { text: options.text } : {}),
  };

  await redis.set(resultKey, updated, { ex: remainingTtl });
  return updated;
}

/**
 * 유료 면접 시뮬레이터 답변 채점·꼬리질문 때마다 result:{orderId} 면접 대비 노트를 자동 갱신
 * (기존 token / tokenHash / expiresAt / 잔여 7일 TTL 그대로 보존)
 */
export async function updateOrderInterviewNote(options: {
  orderId: string;
  interviewSessionId: string;
  interviewNote: InterviewPrepNote;
  text: string;
}): Promise<StoredResultRecord | null> {
  const redis = requireRedisClient();
  const resultKey = getResultKey(options.orderId);
  const existing = await redis.get<StoredResultRecord>(resultKey);
  if (!existing) return null;

  const expiresMs = Date.parse(existing.expiresAt);
  const remainingTtl = Number.isFinite(expiresMs)
    ? Math.max(60, Math.floor((expiresMs - Date.now()) / 1000))
    : RESULT_TTL_SECONDS;

  const updated: StoredResultRecord = {
    ...existing,
    interviewSessionId: options.interviewSessionId,
    interviewNote: options.interviewNote,
    text: options.text,
  };

  await redis.set(resultKey, updated, { ex: remainingTtl });
  return updated;
}

/**
 * 생성 전 입력 누락/만료 등 검증 단계에서 중단 시 횟수 차감·환불 없이 예약 잠금만 원복
 */
export async function releaseOrderReservationWithoutDeduction(options: {
  orderKey: string;
  order: OrderRecord;
}): Promise<OrderRecord> {
  const { orderKey, order } = options;
  const nowIso = new Date().toISOString();
  const lockToken = order.generatingLockToken ?? null;
  const totalGenerations = order.totalGenerations ?? PAID_GENERATIONS;
  const restoredRemaining = order.reservedGeneration
    ? Math.min(totalGenerations, order.remainingGenerations + 1)
    : order.remainingGenerations;

  const restoredOrder: OrderRecord = {
    ...order,
    status: (order.usedCount ?? 0) > 0 ? "done" : "paid",
    remainingGenerations: restoredRemaining,
    reservedGeneration: false,
    generatingLockToken: null,
    generatingAtMs: null,
    updatedAt: nowIso,
  };

  await persistOrderAndReleaseLock({
    orderKey,
    order: restoredOrder,
    expectedLockToken: lockToken,
  });
  await indexOrderKey(orderKey);
  return restoredOrder;
}

export type FailureHandlingOutcome =
  | {
      outcome: "refunded";
      order: OrderRecord;
      cancelResult: TossCancelResult;
    }
  | {
      outcome: "refund_failed";
      order: OrderRecord;
      cancelResult: TossCancelResult;
    }
  | {
      outcome: "retry_allowed";
      order: OrderRecord;
    };

/**
 * 유료 생성 실패 처리:
 * - usedCount === 0 (단 1회도 정상 결과를 받지 못함) -> 토스 결제취소 API로 전액 자동 환불 & 이용권 즉시 무효화
 * - usedCount >= 1 (이미 1회 이상 성공 이력 있음) -> 환불 대신 횟수 미차감 + 재시도 허용 상태 복구
 */
export async function handlePaidGenerationFailure(options: {
  orderKey: string;
  order: OrderRecord;
  error: unknown;
  route: string;
}): Promise<FailureHandlingOutcome> {
  const { orderKey, order, error, route } = options;
  const nowIso = new Date().toISOString();
  const safeErr = sanitizeErrorText(error);
  const lockToken = order.generatingLockToken ?? null;
  const totalGenerations = order.totalGenerations ?? PAID_GENERATIONS;
  const restoredRemaining = order.reservedGeneration
    ? Math.min(totalGenerations, order.remainingGenerations + 1)
    : order.remainingGenerations;

  if ((order.usedCount ?? 0) > 0) {
    const recoveredOrder: OrderRecord = {
      ...order,
      status: "done",
      remainingGenerations: restoredRemaining,
      reservedGeneration: false,
      generatingLockToken: null,
      generatingAtMs: null,
      failedAt: nowIso,
      updatedAt: nowIso,
      lastError: safeErr,
    };
    await persistOrderAndReleaseLock({
      orderKey,
      order: recoveredOrder,
      expectedLockToken: lockToken,
    });
    await indexOrderKey(orderKey);
    return { outcome: "retry_allowed", order: recoveredOrder };
  }

  // 통합 패키지(7,900원) 연동 면접권(bundle_companion)은 7,900원 전액 자동 취소하지 않고 interview_pending 기록 + 무료 재시도 허용
  if (order.planType === "bundle_companion") {
    const pendingOrder: OrderRecord = {
      ...order,
      status: "interview_pending",
      remainingGenerations: restoredRemaining,
      reservedGeneration: false,
      generatingLockToken: null,
      generatingAtMs: null,
      failedAt: nowIso,
      updatedAt: nowIso,
      lastError: safeErr,
    };
    await persistOrderAndReleaseLock({
      orderKey,
      order: pendingOrder,
      expectedLockToken: lockToken,
    });
    await indexOrderKey(orderKey);
    return { outcome: "retry_allowed", order: pendingOrder };
  }

  // usedCount === 0 -> paymentKey 필수 확인 후 토스 전액 결제 취소 실행
  if (!order.paymentKey) {
    const failedOrder: OrderRecord = {
      ...order,
      status: "refund_failed",
      remainingGenerations: restoredRemaining,
      reservedGeneration: false,
      generatingLockToken: null,
      generatingAtMs: null,
      failedAt: nowIso,
      updatedAt: nowIso,
      lastError: `Missing paymentKey for auto-refund (${safeErr})`,
    };
    await persistOrderAndReleaseLock({
      orderKey,
      order: failedOrder,
      expectedLockToken: lockToken,
      forceSave: true,
    });
    await indexOrderKey(orderKey);
    return {
      outcome: "refund_failed",
      order: failedOrder,
      cancelResult: {
        ok: false,
        status: 500,
        errorMessage: "Missing paymentKey on order record",
      },
    };
  }

  const cancelReason = "AI 생성 시스템 오류로 인한 자동 전액 환불";
  // Vercel maxDuration(60s) 내 1차(42s)+폴백(12s) 실패 후에도 환불·상태 저장이 완료되도록 4초 상한 적용
  const cancelResult = await cancelTossPayment({
    paymentKey: order.paymentKey,
    cancelReason,
    orderId: order.orderId,
    route,
    timeoutMs: 4000,
  });

  if (cancelResult.ok) {
    const cancelEntry = Array.isArray(cancelResult.data?.cancels)
      ? cancelResult.data.cancels[0]
      : null;

    const refundedOrder: OrderRecord = {
      ...order,
      paid: false,
      remainingGenerations: 0,
      reservedGeneration: false,
      generatingLockToken: null,
      generatingAtMs: null,
      status: "refunded",
      failedAt: nowIso,
      refundedAt: nowIso,
      updatedAt: nowIso,
      refundAmount:
        typeof cancelEntry?.cancelAmount === "number"
          ? cancelEntry.cancelAmount
          : order.amount,
      refundTransactionKey: cancelEntry?.transactionKey ?? null,
      refundReason: cancelReason,
      lastError: safeErr,
    };

    await persistOrderAndReleaseLock({
      orderKey,
      order: refundedOrder,
      expectedLockToken: lockToken,
      forceSave: true,
    });
    await indexOrderKey(orderKey);

    const redis = requireRedisClient();
    // 통합 패키지 전액 환불 시 연동 면접 이용권도 함께 무효화
    if (order.linkedInterviewOrderId) {
      const companionKey = getOrderKey(order.linkedInterviewOrderId, "interview");
      const companion = await redis.get<OrderRecord>(companionKey);
      if (companion && typeof companion === "object") {
        const companionTtl = await redis.ttl(companionKey);
        await redis.set(
          companionKey,
          {
            ...companion,
            paid: false,
            remainingGenerations: 0,
            status: "refunded" as const,
            refundedAt: nowIso,
            updatedAt: nowIso,
            refundReason: "통합 패키지 전액 자동 환불 연동 무효화",
          },
          { ex: companionTtl > 0 ? companionTtl : PAID_ORDER_TTL_SECONDS }
        );
      }
    }

    // 면접 업그레이드(+3,000원)가 최초 생성 실패로 전액 환불된 경우 기준 자소서 주문의 업그레이드 잠금 해제
    if (order.planType === "interview_upgrade" && order.baseOrderId) {
      const baseKey = getOrderKey(order.baseOrderId, "resume");
      const baseOrder = await redis.get<OrderRecord>(baseKey);
      if (baseOrder && baseOrder.upgradedToInterviewOrderId === order.orderId) {
        const baseTtl = await redis.ttl(baseKey);
        await redis.set(
          baseKey,
          {
            ...baseOrder,
            upgradedToInterviewOrderId: null,
            updatedAt: nowIso,
          },
          { ex: baseTtl > 0 ? baseTtl : PAID_ORDER_TTL_SECONDS }
        );
      }
    }

    return {
      outcome: "refunded",
      order: refundedOrder,
      cancelResult,
    };
  }

  const failedOrder: OrderRecord = {
    ...order,
    status: "refund_failed",
    remainingGenerations: restoredRemaining,
    reservedGeneration: false,
    generatingLockToken: null,
    generatingAtMs: null,
    failedAt: nowIso,
    updatedAt: nowIso,
    lastError: `${safeErr} | Auto-refund failed: ${cancelResult.errorMessage || cancelResult.status}`,
  };
  await persistOrderAndReleaseLock({
    orderKey,
    order: failedOrder,
    expectedLockToken: lockToken,
    forceSave: true,
  });
  await indexOrderKey(orderKey);

  return {
    outcome: "refund_failed",
    order: failedOrder,
    cancelResult,
  };
}

export interface AdminOrderSummary {
  total: number;
  paid: number;
  generating: number;
  stuck: number;
  done: number;
  refunded: number;
  refundFailed: number;
  failed: number;
  mismatchCount: number;
}

export type AdminOrderFilter = "all" | "mismatch" | "stuck" | "refunded" | "done";

export function isOrderStuck(
  order: Partial<OrderRecord>,
  nowMs: number = Date.now()
): boolean {
  if (order.status !== "generating") return false;
  const genMs =
    typeof order.generatingAtMs === "number"
      ? order.generatingAtMs
      : order.generatingAt
        ? Date.parse(order.generatingAt)
        : NaN;
  if (!Number.isFinite(genMs)) return true;
  return nowMs - genMs >= GENERATING_STALE_MS;
}

export function isOrderMismatch(order: Partial<OrderRecord>): boolean {
  return (
    order.status === "paid" ||
    order.status === "generating" ||
    order.status === "interview_pending" ||
    order.status === "refund_failed" ||
    order.status === "failed"
  );
}

function buildAdminSummary(
  orders: OrderRecord[],
  nowMs: number
): AdminOrderSummary {
  return {
    total: orders.length,
    paid: orders.filter((o) => o.status === "paid").length,
    generating: orders.filter((o) => o.status === "generating").length,
    stuck: orders.filter((o) => isOrderStuck(o, nowMs)).length,
    done: orders.filter((o) => o.status === "done").length,
    refunded: orders.filter((o) => o.status === "refunded").length,
    refundFailed: orders.filter((o) => o.status === "refund_failed").length,
    failed: orders.filter((o) => o.status === "failed").length,
    mismatchCount: orders.filter((o) => isOrderMismatch(o)).length,
  };
}

/**
 * 관리자용 주문·생성·자동환불 내역 조회
 */
export async function listAdminOrders(options?: {
  filter?: AdminOrderFilter;
  limit?: number;
  orderId?: string | null;
}): Promise<{ summary: AdminOrderSummary; orders: OrderRecord[] }> {
  const filter = options?.filter ?? "all";
  const limit = Math.min(Math.max(options?.limit ?? 100, 1), 300);
  const targetOrderId = options?.orderId?.trim();
  const nowMs = Date.now();

  if (targetOrderId) {
    const found = await findOrderById(targetOrderId);
    const list = found ? [found.order] : [];
    return { summary: buildAdminSummary(list, nowMs), orders: list };
  }

  const redis = requireRedisClient();
  const keys = await redis.zrange<string[]>(ORDER_INDEX_KEY, 0, limit - 1, {
    rev: true,
  });

  if (!keys || keys.length === 0) {
    return {
      summary: buildAdminSummary([], nowMs),
      orders: [],
    };
  }

  const rawRecords = await redis.mget<(OrderRecord | null)[]>(...keys);
  const allOrders = rawRecords.filter(
    (item): item is OrderRecord => Boolean(item && typeof item === "object")
  );

  const summary = buildAdminSummary(allOrders, nowMs);

  const filtered = allOrders.filter((order) => {
    if (filter === "mismatch") return isOrderMismatch(order);
    if (filter === "stuck") return isOrderStuck(order, nowMs);
    if (filter === "refunded") return order.status === "refunded";
    if (filter === "done") return order.status === "done";
    return true;
  });

  return { summary, orders: filtered };
}

export const PAYMENT_INTENT_TTL_SECONDS = 1_800;

export interface PaymentIntentRecord {
  orderId: string;
  planType: Exclude<PlanType, "bundle_companion">;
  expectedAmount: number;
  baseOrderId?: string | null;
  baseResultToken?: string | null;
  email?: string | null;
  createdAt: string;
}

export function getPaymentIntentKey(orderId: string): string {
  return `payment_intent:${orderId}`;
}

export async function savePaymentIntent(
  options: Omit<PaymentIntentRecord, "createdAt">
): Promise<PaymentIntentRecord> {
  const redis = requireRedisClient();
  const record: PaymentIntentRecord = {
    ...options,
    createdAt: new Date().toISOString(),
  };
  await redis.set(getPaymentIntentKey(options.orderId), record, {
    ex: PAYMENT_INTENT_TTL_SECONDS,
  });
  return record;
}

export async function getPaymentIntent(
  orderId: string
): Promise<PaymentIntentRecord | null> {
  const cleanOrderId = orderId?.trim();
  if (!cleanOrderId) return null;
  const redis = requireRedisClient();
  const raw = await redis.get<PaymentIntentRecord>(getPaymentIntentKey(cleanOrderId));
  return raw && typeof raw === "object" ? raw : null;
}

export type UpgradeEligibilityResult =
  | {
      eligible: true;
      baseOrder: OrderRecord;
      jobTitle: string | null;
      resumeText: string | null;
      resumeExpired: boolean;
      upgradedOrderId: null;
    }
  | {
      eligible: false;
      code:
        | "BASE_ORDER_NOT_FOUND"
        | "BASE_ORDER_REFUNDED"
        | "BASE_ORDER_NOT_RESUME_SINGLE"
        | "ALREADY_UPGRADED"
        | "UPGRADE_OWNERSHIP_FAILED";
      message: string;
      upgradedOrderId?: string | null;
      baseOrder?: OrderRecord | null;
    };

function extractResumeTextFromStoredResult(
  result: StoredResultRecord | null
): string | null {
  if (!result) return null;
  let candidate = "";
  if (Array.isArray(result.items) && result.items.length > 0) {
    candidate = result.items
      .map((item) => `[${item.title}]\n${item.body}`)
      .join("\n\n")
      .trim();
  } else if (typeof result.sourceMemo === "string" && result.sourceMemo.trim()) {
    candidate = result.sourceMemo.trim();
  } else if (typeof result.text === "string" && result.text.trim()) {
    candidate = result.text.trim();
  }
  if (!candidate) return null;
  return candidate.length > 4000 ? candidate.slice(0, 4000) : candidate;
}

/**
 * +3,000원 면접 업그레이드 자격·소유권·1회 제한 서버 검증
 * - 자소서 단독 유료 주문(미환불) 실존 여부 + 이미 업그레이드 여부 + 토큰/이메일 소유권 확인
 * - 7일 result:* 만료 시에도 1년 order:* 기준으로 할인 자격 유지 + resumeExpired: true 반환
 */
export async function validateInterviewUpgradeEligibility(options: {
  baseOrderId: string;
  baseResultToken?: string | null;
  email?: string | null;
}): Promise<UpgradeEligibilityResult> {
  const cleanBaseOrderId = options.baseOrderId?.trim();
  const cleanToken = options.baseResultToken?.trim() || null;
  const cleanEmail = normalizeEmail(options.email);

  if (!cleanBaseOrderId) {
    return {
      eligible: false,
      code: "BASE_ORDER_NOT_FOUND",
      message: "업그레이드 대상 자소서 주문번호가 누락되었습니다.",
    };
  }

  const redis = requireRedisClient();
  const baseOrder = await redis.get<OrderRecord>(getOrderKey(cleanBaseOrderId, "resume"));

  if (!baseOrder || typeof baseOrder !== "object" || baseOrder.paid !== true) {
    return {
      eligible: false,
      code: "BASE_ORDER_NOT_FOUND",
      message: "유효한 유료 자소서 주문 내역을 찾을 수 없습니다.",
    };
  }

  if (baseOrder.status === "refunded" || baseOrder.status === "refund_failed") {
    return {
      eligible: false,
      code: "BASE_ORDER_REFUNDED",
      message: "환불 완료 또는 환불 처리 중인 주문에는 업그레이드 할인을 적용할 수 없습니다.",
    };
  }

  if (
    baseOrder.serviceType !== "resume" ||
    baseOrder.planType === "bundle" ||
    Boolean(baseOrder.linkedInterviewOrderId)
  ) {
    return {
      eligible: false,
      code: "BASE_ORDER_NOT_RESUME_SINGLE",
      message: "통합 패키지 주문은 이미 면접 시뮬레이터 이용권이 포함되어 있습니다.",
    };
  }

  if (baseOrder.upgradedToInterviewOrderId) {
    return {
      eligible: false,
      code: "ALREADY_UPGRADED",
      message: "해당 자소서 주문은 이미 +3,000원 면접 업그레이드가 적용되었습니다.",
      upgradedOrderId: baseOrder.upgradedToInterviewOrderId,
      baseOrder,
    };
  }

  // 소유권 검증: resultTokenHash(1년 보관) 우선, 미생성/유실 시 주문 이메일 대조 필수
  if (baseOrder.resultTokenHash) {
    if (cleanToken) {
      const candidateHash = await hashResultToken(cleanToken);
      if (!timingSafeEqualStrings(candidateHash, baseOrder.resultTokenHash)) {
        return {
          eligible: false,
          code: "UPGRADE_OWNERSHIP_FAILED",
          message: "업그레이드 인증 토큰이 일치하지 않습니다.",
        };
      }
    } else if (!cleanEmail || !baseOrder.email || cleanEmail !== baseOrder.email) {
      return {
        eligible: false,
        code: "UPGRADE_OWNERSHIP_FAILED",
        message: "자소서 주문 소유권 확인을 위해 결과 링크 토큰 또는 구매 당시 이메일이 필요합니다.",
      };
    }
  } else if (!cleanEmail || !baseOrder.email || cleanEmail !== baseOrder.email) {
    return {
      eligible: false,
      code: "UPGRADE_OWNERSHIP_FAILED",
      message: "자소서 구매 당시 이메일 정보와 일치하지 않아 업그레이드할 수 없습니다.",
    };
  }

  const storedResult = await redis.get<StoredResultRecord>(getResultKey(cleanBaseOrderId));
  const expiresAtMs = storedResult?.expiresAt
    ? Date.parse(storedResult.expiresAt)
    : baseOrder.resultExpiresAt
      ? Date.parse(baseOrder.resultExpiresAt)
      : NaN;
  const expired =
    !storedResult || (Number.isFinite(expiresAtMs) && Date.now() > expiresAtMs);
  const resumeText = expired ? null : extractResumeTextFromStoredResult(storedResult);

  return {
    eligible: true,
    baseOrder,
    jobTitle: storedResult?.jobTitle ?? null,
    resumeText,
    resumeExpired: expired || !resumeText,
    upgradedOrderId: null,
  };
}

/**
 * 통합 패키지(bundle) 또는 업그레이드 완료 주문에서 자소서 원문/연동 면접 주문 상태 복구
 */
export async function resolveBundledInterviewContext(options: {
  baseOrderId: string;
  baseResultToken?: string | null;
}): Promise<{
  ok: boolean;
  linkedInterviewOrderId: string | null;
  remainingGenerations: number;
  jobTitle: string | null;
  resumeText: string | null;
  resumeExpired: boolean;
}> {
  const cleanBaseOrderId = options.baseOrderId?.trim();
  const cleanToken = options.baseResultToken?.trim() || "";
  if (!cleanBaseOrderId) {
    return {
      ok: false,
      linkedInterviewOrderId: null,
      remainingGenerations: 0,
      jobTitle: null,
      resumeText: null,
      resumeExpired: true,
    };
  }

  const redis = requireRedisClient();
  const baseOrder = await redis.get<OrderRecord>(getOrderKey(cleanBaseOrderId, "resume"));
  const interviewOrderId =
    baseOrder?.linkedInterviewOrderId || `int_${cleanBaseOrderId}`;
  const companionOrder = await redis.get<OrderRecord>(
    getOrderKey(interviewOrderId, "interview")
  );

  if (
    !baseOrder ||
    baseOrder.paid !== true ||
    baseOrder.status === "refunded" ||
    !companionOrder ||
    companionOrder.paid !== true ||
    companionOrder.status === "refunded"
  ) {
    return {
      ok: false,
      linkedInterviewOrderId: null,
      remainingGenerations: 0,
      jobTitle: null,
      resumeText: null,
      resumeExpired: true,
    };
  }

  let resumeText: string | null = null;
  let jobTitle: string | null = null;
  let resumeExpired = true;

  if (baseOrder.resultTokenHash && cleanToken) {
    const candidateHash = await hashResultToken(cleanToken);
    if (timingSafeEqualStrings(candidateHash, baseOrder.resultTokenHash)) {
      const storedResult = await redis.get<StoredResultRecord>(
        getResultKey(cleanBaseOrderId)
      );
      const expiresAtMs = storedResult?.expiresAt
        ? Date.parse(storedResult.expiresAt)
        : NaN;
      const expired =
        !storedResult || (Number.isFinite(expiresAtMs) && Date.now() > expiresAtMs);
      if (!expired && storedResult) {
        resumeText = extractResumeTextFromStoredResult(storedResult);
        jobTitle = storedResult.jobTitle ?? null;
        resumeExpired = !resumeText;
      }
    }
  }

  return {
    ok: true,
    linkedInterviewOrderId: companionOrder.orderId,
    remainingGenerations: companionOrder.remainingGenerations,
    jobTitle,
    resumeText,
    resumeExpired,
  };
}
