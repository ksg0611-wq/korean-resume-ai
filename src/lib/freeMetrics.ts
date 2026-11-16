import { GEMINI_CONFIG } from "@/lib/gemini";
import { requireRedisClient } from "@/lib/redis";
import { getRedisCredentials } from "@/lib/redisConfig";

export const FREE_DRAFT_DAILY_LIMIT = 300;
const METRICS_TTL_SECONDS = 14 * 24 * 60 * 60; // 14일 보관
const ALERT_DEDUPE_TTL_SECONDS = 2 * 24 * 60 * 60; // 48시간 (KST 일자 키 분리 + 여유)
const WEBHOOK_TIMEOUT_MS = 2_500;

/**
 * 2027.01+ 정식 과금 기준 무료 경로 1회당 추정 AI 원가 (KRW, 1,400원/$1)
 * - reports/model-benchmark-4-hydrogen.md 및 hybrid-model-rollout.md 실측 평균 기준
 */
export const FREE_UNIT_COSTS_KRW = {
  diagnose: 13.67,
  draftHydrogen: 65.02,
  draftFallback: 17.2,
  interviewGen: 6.25,
  interviewEval: 11.39,
} as const;

export type FreeMetricKind =
  | "diagnose"
  | "draft"
  | "draft_hydrogen"
  | "draft_fallback"
  | "interview_gen"
  | "interview_eval";

export interface FreeDraftCircuitResult {
  date: string;
  count: number;
  limit: number;
  tripped: boolean;
  alertSent: boolean;
  preferredModel: string;
}

export interface DailyFreeMetricsSummary {
  date: string;
  limit: number;
  circuitBreakerOpen: boolean;
  alertedAt: string | null;
  counts: {
    diagnose: number;
    draft: number;
    draftHydrogen: number;
    draftFallback: number;
    interviewGen: number;
    interviewEval: number;
    totalCalls: number;
  };
  estimatedCostKrw: {
    diagnose: number;
    draft: number;
    interview: number;
    total: number;
  };
  keys: {
    diagnose: string;
    draft: string;
    interviewGen: string;
    interviewEval: string;
  };
}

/**
 * KST(Asia/Seoul) 기준 일자 문자열(YYYY-MM-DD) 반환
 */
export function getKstDateString(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year = parts.find((p) => p.type === "year")?.value || "1970";
  const month = parts.find((p) => p.type === "month")?.value || "01";
  const day = parts.find((p) => p.type === "day")?.value || "01";
  return `${year}-${month}-${day}`;
}

export function buildFreeMetricKey(date: string, metric: FreeMetricKind): string {
  return `metrics:free:${date}:${metric}`;
}

export function buildDraftAlertedKey(date: string): string {
  return `metrics:free:${date}:draft_alerted`;
}

async function incrementMetricCounter(key: string): Promise<number | null> {
  if (!getRedisCredentials()) return null;
  try {
    const redis = requireRedisClient();
    const updated = Number(await redis.incr(key));
    if (updated === 1 || updated % 50 === 0) {
      await redis.expire(key, METRICS_TTL_SECONDS);
    }
    return updated;
  } catch (err) {
    console.warn(`[FreeMetrics] Failed to increment ${key}:`, err);
    return null;
  }
}

async function sendCircuitBreakerWebhookAlert(options: {
  date: string;
  count: number;
  limit: number;
}): Promise<boolean> {
  const webhookUrl = process.env.ALERT_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    console.warn(
      `[FreeMetrics] ALERT_WEBHOOK_URL not configured; circuit breaker tripped alert skipped (${options.date}, count=${options.count}/${options.limit}).`
    );
    return false;
  }

  const message = `[Korea Resume AI 서킷 브레이커 작동] ${options.date} 무료 미리보기(draft) 호출이 일일 한도(${options.limit}회)를 초과해 현재 ${options.count}회에 도달했습니다. KST 자정까지 무료 미리보기 모델이 ${GEMINI_CONFIG.WRITING_MODEL} -> ${GEMINI_CONFIG.FREE_MODEL}로 자동 전환됩니다.`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        alertType: "FREE_DRAFT_CIRCUIT_BREAKER",
        route: "/api/generate",
        date: options.date,
        count: options.count,
        limit: options.limit,
        fallbackModel: GEMINI_CONFIG.FREE_MODEL,
        timestamp: new Date().toISOString(),
        text: message,
        content: message,
      }),
      signal: controller.signal,
    });
    return res.ok;
  } catch (err) {
    console.warn("[FreeMetrics] Failed to send circuit breaker webhook:", err);
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 무료 진단 및 무료 면접 체험 호출 카운터 기록
 */
export async function recordFreeEndpointCall(
  metric: "diagnose" | "interview_gen" | "interview_eval",
  now: Date = new Date()
): Promise<number | null> {
  const date = getKstDateString(now);
  return incrementMetricCounter(buildFreeMetricKey(date, metric));
}

/**
 * 무료 미리보기(mode: "draft") 일일 카운터 증가 및 300회 서킷 브레이커 판별:
 * - 1 ~ 300회: gemini-4-hydrogen (WRITING_MODEL) 유지
 * - 301회 이상: 일 1회 ALERT_WEBHOOK_URL 관리자 알림 발송 후 KST 자정까지 gemini-3.8-flash(FREE_MODEL) 자동 전환
 */
export async function checkAndRecordFreeDraftCall(
  now: Date = new Date()
): Promise<FreeDraftCircuitResult> {
  const date = getKstDateString(now);

  if (!getRedisCredentials()) {
    return {
      date,
      count: 0,
      limit: FREE_DRAFT_DAILY_LIMIT,
      tripped: false,
      alertSent: false,
      preferredModel: GEMINI_CONFIG.WRITING_MODEL,
    };
  }

  try {
    const redis = requireRedisClient();
    const totalKey = buildFreeMetricKey(date, "draft");
    const count = Number(await redis.incr(totalKey));
    if (count === 1 || count % 50 === 0) {
      await redis.expire(totalKey, METRICS_TTL_SECONDS);
    }

    if (count <= FREE_DRAFT_DAILY_LIMIT) {
      await incrementMetricCounter(buildFreeMetricKey(date, "draft_hydrogen"));
      return {
        date,
        count,
        limit: FREE_DRAFT_DAILY_LIMIT,
        tripped: false,
        alertSent: false,
        preferredModel: GEMINI_CONFIG.WRITING_MODEL,
      };
    }

    await incrementMetricCounter(buildFreeMetricKey(date, "draft_fallback"));

    let alertSent = false;
    const alertKey = buildDraftAlertedKey(date);
    const lockResult = await redis.set(alertKey, new Date().toISOString(), {
      ex: ALERT_DEDUPE_TTL_SECONDS,
      nx: true,
    });
    if (lockResult === "OK") {
      alertSent = await sendCircuitBreakerWebhookAlert({
        date,
        count,
        limit: FREE_DRAFT_DAILY_LIMIT,
      });
    }

    return {
      date,
      count,
      limit: FREE_DRAFT_DAILY_LIMIT,
      tripped: true,
      alertSent,
      preferredModel: GEMINI_CONFIG.FREE_MODEL,
    };
  } catch (err) {
    console.warn("[FreeMetrics] Draft circuit check failed; defaulting to WRITING_MODEL:", err);
    return {
      date,
      count: 0,
      limit: FREE_DRAFT_DAILY_LIMIT,
      tripped: false,
      alertSent: false,
      preferredModel: GEMINI_CONFIG.WRITING_MODEL,
    };
  }
}

/**
 * /admin 대시보드용 오늘(KST) 무료 경로 호출 건수 및 추정 원가(KRW) 집계
 */
export async function getDailyFreeMetricsSummary(
  dateStr?: string
): Promise<DailyFreeMetricsSummary> {
  const date = dateStr || getKstDateString();
  const keys = {
    diagnose: buildFreeMetricKey(date, "diagnose"),
    draft: buildFreeMetricKey(date, "draft"),
    interviewGen: buildFreeMetricKey(date, "interview_gen"),
    interviewEval: buildFreeMetricKey(date, "interview_eval"),
  };

  if (!getRedisCredentials()) {
    return {
      date,
      limit: FREE_DRAFT_DAILY_LIMIT,
      circuitBreakerOpen: false,
      alertedAt: null,
      counts: {
        diagnose: 0,
        draft: 0,
        draftHydrogen: 0,
        draftFallback: 0,
        interviewGen: 0,
        interviewEval: 0,
        totalCalls: 0,
      },
      estimatedCostKrw: {
        diagnose: 0,
        draft: 0,
        interview: 0,
        total: 0,
      },
      keys,
    };
  }

  try {
    const redis = requireRedisClient();
    const values = await redis.mget<Array<string | number | null>>(
      keys.diagnose,
      keys.draft,
      buildFreeMetricKey(date, "draft_hydrogen"),
      buildFreeMetricKey(date, "draft_fallback"),
      keys.interviewGen,
      keys.interviewEval,
      buildDraftAlertedKey(date)
    );

    const toCount = (v: unknown) => {
      const n = Number(v ?? 0);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    };

    const diagnose = toCount(values?.[0]);
    const draft = toCount(values?.[1]);
    let draftHydrogen = toCount(values?.[2]);
    let draftFallback = toCount(values?.[3]);
    const interviewGen = toCount(values?.[4]);
    const interviewEval = toCount(values?.[5]);
    const alertedAt = typeof values?.[6] === "string" ? values[6] : null;

    if (draft > 0 && draftHydrogen === 0 && draftFallback === 0) {
      draftHydrogen = Math.min(draft, FREE_DRAFT_DAILY_LIMIT);
      draftFallback = Math.max(0, draft - FREE_DRAFT_DAILY_LIMIT);
    }

    const diagnoseCost = Number((diagnose * FREE_UNIT_COSTS_KRW.diagnose).toFixed(1));
    const draftCost = Number(
      (
        draftHydrogen * FREE_UNIT_COSTS_KRW.draftHydrogen +
        draftFallback * FREE_UNIT_COSTS_KRW.draftFallback
      ).toFixed(1)
    );
    const interviewCost = Number(
      (
        interviewGen * FREE_UNIT_COSTS_KRW.interviewGen +
        interviewEval * FREE_UNIT_COSTS_KRW.interviewEval
      ).toFixed(1)
    );
    const totalCost = Number((diagnoseCost + draftCost + interviewCost).toFixed(1));

    return {
      date,
      limit: FREE_DRAFT_DAILY_LIMIT,
      circuitBreakerOpen: draft > FREE_DRAFT_DAILY_LIMIT || Boolean(alertedAt),
      alertedAt,
      counts: {
        diagnose,
        draft,
        draftHydrogen,
        draftFallback,
        interviewGen,
        interviewEval,
        totalCalls: diagnose + draft + interviewGen + interviewEval,
      },
      estimatedCostKrw: {
        diagnose: diagnoseCost,
        draft: draftCost,
        interview: interviewCost,
        total: totalCost,
      },
      keys,
    };
  } catch (err) {
    console.warn("[FreeMetrics] Failed to aggregate daily free metrics:", err);
    return {
      date,
      limit: FREE_DRAFT_DAILY_LIMIT,
      circuitBreakerOpen: false,
      alertedAt: null,
      counts: {
        diagnose: 0,
        draft: 0,
        draftHydrogen: 0,
        draftFallback: 0,
        interviewGen: 0,
        interviewEval: 0,
        totalCalls: 0,
      },
      estimatedCostKrw: {
        diagnose: 0,
        draft: 0,
        interview: 0,
        total: 0,
      },
      keys,
    };
  }
}
