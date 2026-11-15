import {
  PAID_GENERATIONS,
  PAID_ORDER_TTL_SECONDS,
  RESULT_TTL_SECONDS,
  normalizeEmail,
} from "@/lib/policy";
import { requireRedisClient } from "@/lib/redis";
import {
  buildResultUrl,
  findOrderById,
  generateSecureToken,
  getOrderKey,
  getResultKey,
  hashResultToken,
  type OrderRecord,
  type ServiceType,
  type StoredResultRecord,
} from "@/lib/results";
import { cancelTossPayment, type TossCancelResult } from "@/lib/toss";
import { sanitizeErrorText } from "@/lib/alerts";

export const ORDER_INDEX_KEY = "orders:index";
const GENERATING_STALE_MS = 55_000;

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
  paymentKey: string;
  amount: number;
  email?: string | null;
  receiptUrl?: string | null;
}): Promise<{ order: OrderRecord; alreadyConfirmed: boolean }> {
  const { orderId, serviceType, paymentKey, amount, email, receiptUrl } = options;
  const redis = requireRedisClient();
  const orderKey = getOrderKey(orderId, serviceType);
  const existing = await redis.get<OrderRecord>(orderKey);

  // 동일 주문·동일 paymentKey 재요청 시 멱등 처리 (잔여 횟수·상태 초기화 방지)
  if (existing && existing.paymentKey === paymentKey) {
    return { order: existing, alreadyConfirmed: true };
  }

  const now = new Date().toISOString();
  const cleanEmail = normalizeEmail(email);

  const record: OrderRecord = {
    orderId,
    serviceType,
    paymentKey,
    amount: Number.isFinite(amount) ? amount : 0,
    email: cleanEmail,
    receiptUrl: receiptUrl ?? null,
    paid: true,
    status: "paid",
    totalGenerations: PAID_GENERATIONS,
    remainingGenerations: PAID_GENERATIONS,
    usedCount: 0,
    paidAt: now,
    generatingAt: null,
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
    ...(serviceType === "interview" ? { verified: true } : {}),
  };

  await redis.set(orderKey, record, { ex: PAID_ORDER_TTL_SECONDS });
  await indexOrderKey(orderKey);

  return { order: record, alreadyConfirmed: false };
}

export type BeginGenerationResult =
  | { ok: true; orderKey: string; order: OrderRecord }
  | { ok: false; status: number; message: string; code: string };

/**
 * 유료 생성 시작 전 주문 검증 및 status -> "generating" 전이
 */
export async function beginPaidGeneration(options: {
  orderId: string;
  serviceType: ServiceType;
}): Promise<BeginGenerationResult> {
  const { orderId, serviceType } = options;
  const redis = requireRedisClient();
  const orderKey = getOrderKey(orderId, serviceType);
  const raw = await redis.get<Partial<OrderRecord>>(orderKey);

  if (!raw) {
    return {
      ok: false,
      status: 403,
      code: "INVALID_ORDER",
      message: "Forbidden. Invalid payment info or generations exhausted.",
    };
  }

  if (raw.status === "refunded") {
    return {
      ok: false,
      status: 403,
      code: "ORDER_REFUNDED",
      message: "이미 자동 환불 처리되어 무효화된 주문입니다.",
    };
  }

  if (
    !raw.paid ||
    typeof raw.remainingGenerations !== "number" ||
    raw.remainingGenerations < 1
  ) {
    return {
      ok: false,
      status: 403,
      code: "GENERATIONS_EXHAUSTED",
      message: "Forbidden. Invalid payment info or generations exhausted.",
    };
  }

  // 동시 중복 요청 방어 (직전 generating 시작 후 55초 이내면 409)
  if (raw.status === "generating" && raw.generatingAt) {
    const elapsed = Date.now() - Date.parse(raw.generatingAt);
    if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < GENERATING_STALE_MS) {
      return {
        ok: false,
        status: 409,
        code: "GENERATION_IN_PROGRESS",
        message: "이미 AI 생성이 진행 중입니다. 잠시만 기다려 주세요.",
      };
    }
  }

  const now = new Date().toISOString();
  const normalized: OrderRecord = {
    orderId: raw.orderId || orderId,
    serviceType: raw.serviceType || serviceType,
    paymentKey: raw.paymentKey || "",
    amount: typeof raw.amount === "number" ? raw.amount : 4900,
    email: raw.email ?? null,
    receiptUrl: raw.receiptUrl ?? null,
    paid: true,
    status: "generating",
    totalGenerations: raw.totalGenerations ?? PAID_GENERATIONS,
    remainingGenerations: raw.remainingGenerations,
    usedCount: typeof raw.usedCount === "number" ? raw.usedCount : Math.max(0, PAID_GENERATIONS - raw.remainingGenerations),
    paidAt: raw.paidAt || now,
    generatingAt: now,
    doneAt: raw.doneAt ?? null,
    failedAt: raw.failedAt ?? null,
    refundedAt: raw.refundedAt ?? null,
    updatedAt: now,
    usedModel: raw.usedModel ?? null,
    lastError: raw.lastError ?? null,
    refundAmount: raw.refundAmount ?? null,
    refundTransactionKey: raw.refundTransactionKey ?? null,
    refundReason: raw.refundReason ?? null,
    resultTokenHash: raw.resultTokenHash ?? null,
    resultExpiresAt: raw.resultExpiresAt ?? null,
    verified: raw.verified,
  };

  await redis.set(orderKey, normalized, { keepTtl: true });
  await indexOrderKey(orderKey);

  return { ok: true, orderKey, order: normalized };
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
}): Promise<{
  order: OrderRecord;
  resultToken: string;
  resultUrl: string;
  resultExpiresAt: string;
}> {
  const { orderKey, order, title, text, usedModel } = options;
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

  const storedResult: StoredResultRecord = {
    orderId: order.orderId,
    serviceType: order.serviceType,
    token: resultToken,
    tokenHash: resultTokenHash,
    title,
    text,
    receiptUrl: order.receiptUrl ?? null,
    createdAt: existingResult?.createdAt || nowIso,
    expiresAt: expiresAtIso,
  };

  await redis.set(resultKey, storedResult, { ex: RESULT_TTL_SECONDS });

  const updatedOrder: OrderRecord = {
    ...order,
    status: "done",
    usedCount: (order.usedCount ?? 0) + 1,
    remainingGenerations: Math.max(0, order.remainingGenerations - 1),
    doneAt: nowIso,
    updatedAt: nowIso,
    usedModel,
    lastError: null,
    resultTokenHash,
    resultExpiresAt: expiresAtIso,
  };

  await redis.set(orderKey, updatedOrder, { keepTtl: true });
  await indexOrderKey(orderKey);

  return {
    order: updatedOrder,
    resultToken,
    resultUrl: buildResultUrl(order.orderId, resultToken),
    resultExpiresAt: expiresAtIso,
  };
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
  const redis = requireRedisClient();
  const nowIso = new Date().toISOString();
  const safeErr = sanitizeErrorText(error);

  if ((order.usedCount ?? 0) > 0) {
    const recoveredOrder: OrderRecord = {
      ...order,
      status: "done",
      failedAt: nowIso,
      updatedAt: nowIso,
      lastError: safeErr,
    };
    await redis.set(orderKey, recoveredOrder, { keepTtl: true });
    await indexOrderKey(orderKey);
    return { outcome: "retry_allowed", order: recoveredOrder };
  }

  // usedCount === 0 -> paymentKey 필수 확인 후 토스 전액 결제 취소 실행
  if (!order.paymentKey) {
    const failedOrder: OrderRecord = {
      ...order,
      status: "failed",
      failedAt: nowIso,
      updatedAt: nowIso,
      lastError: `Missing paymentKey for auto-refund (${safeErr})`,
    };
    await redis.set(orderKey, failedOrder, { keepTtl: true });
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
  const cancelResult = await cancelTossPayment({
    paymentKey: order.paymentKey,
    cancelReason,
    orderId: order.orderId,
    route,
  });

  if (cancelResult.ok) {
    const cancelEntry = Array.isArray(cancelResult.data?.cancels)
      ? cancelResult.data.cancels[0]
      : null;

    const refundedOrder: OrderRecord = {
      ...order,
      paid: false,
      remainingGenerations: 0,
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

    await redis.set(orderKey, refundedOrder, { keepTtl: true });
    await indexOrderKey(orderKey);

    return {
      outcome: "refunded",
      order: refundedOrder,
      cancelResult,
    };
  }

  const failedOrder: OrderRecord = {
    ...order,
    status: "failed",
    failedAt: nowIso,
    updatedAt: nowIso,
    lastError: `${safeErr} | Auto-refund failed: ${cancelResult.errorMessage || cancelResult.status}`,
  };
  await redis.set(orderKey, failedOrder, { keepTtl: true });
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
  done: number;
  refunded: number;
  failed: number;
  mismatchCount: number;
}

export type AdminOrderFilter = "all" | "mismatch" | "refunded" | "done";

export function isOrderMismatch(order: Partial<OrderRecord>): boolean {
  return order.status === "paid" || order.status === "generating" || order.status === "failed";
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

  if (targetOrderId) {
    const found = await findOrderById(targetOrderId);
    const list = found ? [found.order] : [];
    const summary: AdminOrderSummary = {
      total: list.length,
      paid: list.filter((o) => o.status === "paid").length,
      generating: list.filter((o) => o.status === "generating").length,
      done: list.filter((o) => o.status === "done").length,
      refunded: list.filter((o) => o.status === "refunded").length,
      failed: list.filter((o) => o.status === "failed").length,
      mismatchCount: list.filter((o) => isOrderMismatch(o)).length,
    };
    return { summary, orders: list };
  }

  const redis = requireRedisClient();
  const keys = await redis.zrange<string[]>(ORDER_INDEX_KEY, 0, limit - 1, {
    rev: true,
  });

  if (!keys || keys.length === 0) {
    return {
      summary: {
        total: 0,
        paid: 0,
        generating: 0,
        done: 0,
        refunded: 0,
        failed: 0,
        mismatchCount: 0,
      },
      orders: [],
    };
  }

  const rawRecords = await redis.mget<(OrderRecord | null)[]>(...keys);
  const allOrders = rawRecords.filter(
    (item): item is OrderRecord => Boolean(item && typeof item === "object")
  );

  const summary: AdminOrderSummary = {
    total: allOrders.length,
    paid: allOrders.filter((o) => o.status === "paid").length,
    generating: allOrders.filter((o) => o.status === "generating").length,
    done: allOrders.filter((o) => o.status === "done").length,
    refunded: allOrders.filter((o) => o.status === "refunded").length,
    failed: allOrders.filter((o) => o.status === "failed").length,
    mismatchCount: allOrders.filter((o) => isOrderMismatch(o)).length,
  };

  const filtered = allOrders.filter((order) => {
    if (filter === "mismatch") return isOrderMismatch(order);
    if (filter === "refunded") return order.status === "refunded";
    if (filter === "done") return order.status === "done";
    return true;
  });

  return { summary, orders: filtered };
}
