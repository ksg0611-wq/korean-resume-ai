import { requireRedisClient } from "@/lib/redis";
import { getRedisCredentials } from "@/lib/redisConfig";
import { getKstDateString } from "@/lib/freeMetrics";
import {
  ANALYTICS_EVENTS,
  ANALYTICS_PLAN_TYPES,
  ANALYTICS_SOURCES,
  sanitizeAnalyticsEventName,
  sanitizeAnalyticsPlanType,
  sanitizeAnalyticsSource,
  type AnalyticsEventName,
  type AnalyticsPlanType,
  type AnalyticsSource,
} from "@/lib/analytics";

const FUNNEL_TTL_SECONDS = 35 * 24 * 60 * 60; // 35일 보관

export function buildFunnelTotalKey(
  date: string,
  event: AnalyticsEventName
): string {
  return `analytics:funnel:${date}:total:${event}`;
}

export function buildFunnelSourceKey(
  date: string,
  source: AnalyticsSource,
  event: AnalyticsEventName
): string {
  return `analytics:funnel:${date}:source:${source}:${event}`;
}

export function buildFunnelPlanKey(
  date: string,
  planType: AnalyticsPlanType,
  event: AnalyticsEventName
): string {
  return `analytics:funnel:${date}:plan:${planType}:${event}`;
}

export interface DailyFunnelEventRow {
  event: AnalyticsEventName;
  total: number;
  bySource: Record<AnalyticsSource, number>;
  byPlanType: Record<AnalyticsPlanType, number>;
}

export interface DailyFunnelSummary {
  date: string;
  redisKeyPattern: string;
  rows: DailyFunnelEventRow[];
  totalsByEvent: Record<AnalyticsEventName, number>;
  totalsBySource: Record<AnalyticsSource, number>;
  conversionRates: {
    draftToCheckoutPct: number | null;
    checkoutToSuccessPct: number | null;
  };
}

async function incrWithTtl(key: string): Promise<number> {
  const redis = requireRedisClient();
  const count = Number(await redis.incr(key));
  if (count === 1 || count % 50 === 0) {
    await redis.expire(key, FUNNEL_TTL_SECONDS);
  }
  return count;
}

/**
 * 비식별 전환 퍼널 이벤트를 Redis 일별 카운터(`analytics:funnel:YYYY-MM-DD:*`)에 누적
 * - IP·이메일·본문 등 개인정보를 받지 않으며 허용 목록 외 값은 무시합니다.
 */
export async function recordFunnelEventServer(input: {
  event: unknown;
  source?: unknown;
  planType?: unknown;
  now?: Date;
}): Promise<{
  recorded: boolean;
  date: string;
  event: AnalyticsEventName | null;
  source: AnalyticsSource;
  planType: AnalyticsPlanType;
}> {
  const event = sanitizeAnalyticsEventName(input.event);
  const source = sanitizeAnalyticsSource(input.source);
  const planType = sanitizeAnalyticsPlanType(input.planType);
  const date = getKstDateString(input.now);

  if (!event) {
    return { recorded: false, date, event: null, source, planType };
  }

  if (!getRedisCredentials()) {
    return { recorded: false, date, event, source, planType };
  }

  try {
    await Promise.all([
      incrWithTtl(buildFunnelTotalKey(date, event)),
      incrWithTtl(buildFunnelSourceKey(date, source, event)),
      incrWithTtl(buildFunnelPlanKey(date, planType, event)),
    ]);
    return { recorded: true, date, event, source, planType };
  } catch (err) {
    console.warn("[Analytics] Failed to record funnel event:", err);
    return { recorded: false, date, event, source, planType };
  }
}

function emptyFunnelSummary(date: string): DailyFunnelSummary {
  const totalsByEvent = Object.fromEntries(
    ANALYTICS_EVENTS.map((ev) => [ev, 0])
  ) as Record<AnalyticsEventName, number>;
  const totalsBySource = Object.fromEntries(
    ANALYTICS_SOURCES.map((src) => [src, 0])
  ) as Record<AnalyticsSource, number>;

  const rows: DailyFunnelEventRow[] = ANALYTICS_EVENTS.map((ev) => ({
    event: ev,
    total: 0,
    bySource: Object.fromEntries(
      ANALYTICS_SOURCES.map((src) => [src, 0])
    ) as Record<AnalyticsSource, number>,
    byPlanType: Object.fromEntries(
      ANALYTICS_PLAN_TYPES.map((pt) => [pt, 0])
    ) as Record<AnalyticsPlanType, number>,
  }));

  return {
    date,
    redisKeyPattern: `analytics:funnel:${date}:*`,
    rows,
    totalsByEvent,
    totalsBySource,
    conversionRates: {
      draftToCheckoutPct: null,
      checkoutToSuccessPct: null,
    },
  };
}

export function sanitizeAnalyticsDateParam(raw?: string | null): string {
  const clean = typeof raw === "string" ? raw.trim() : "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return clean;
  }
  return getKstDateString();
}

/**
 * /admin 대시보드용 일별·유입경로별·상품별 전환 퍼널 집계
 */
export async function getDailyFunnelSummary(
  dateStr?: string | null
): Promise<DailyFunnelSummary> {
  const date = sanitizeAnalyticsDateParam(dateStr);

  if (!getRedisCredentials()) {
    return emptyFunnelSummary(date);
  }

  const keys: string[] = [];
  for (const ev of ANALYTICS_EVENTS) {
    keys.push(buildFunnelTotalKey(date, ev));
  }
  for (const ev of ANALYTICS_EVENTS) {
    for (const src of ANALYTICS_SOURCES) {
      keys.push(buildFunnelSourceKey(date, src, ev));
    }
  }
  for (const ev of ANALYTICS_EVENTS) {
    for (const pt of ANALYTICS_PLAN_TYPES) {
      keys.push(buildFunnelPlanKey(date, pt, ev));
    }
  }

  try {
    const redis = requireRedisClient();
    const values = await redis.mget<Array<string | number | null>>(...keys);

    const toCount = (idx: number): number => {
      const n = Number(values?.[idx] ?? 0);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    };

    const summary = emptyFunnelSummary(date);
    let cursor = 0;

    for (let i = 0; i < ANALYTICS_EVENTS.length; i++) {
      const ev = ANALYTICS_EVENTS[i];
      const count = toCount(cursor++);
      summary.rows[i].total = count;
      summary.totalsByEvent[ev] = count;
    }

    for (let i = 0; i < ANALYTICS_EVENTS.length; i++) {
      for (const src of ANALYTICS_SOURCES) {
        const count = toCount(cursor++);
        summary.rows[i].bySource[src] = count;
        summary.totalsBySource[src] += count;
      }
    }

    for (let i = 0; i < ANALYTICS_EVENTS.length; i++) {
      for (const pt of ANALYTICS_PLAN_TYPES) {
        summary.rows[i].byPlanType[pt] = toCount(cursor++);
      }
    }

    const leadActions =
      summary.totalsByEvent.diagnose_run +
      summary.totalsByEvent.draft_run +
      summary.totalsByEvent.interview_free_run;
    if (leadActions > 0) {
      summary.conversionRates.draftToCheckoutPct = Number(
        ((summary.totalsByEvent.checkout_click / leadActions) * 100).toFixed(1)
      );
    }
    if (summary.totalsByEvent.checkout_click > 0) {
      summary.conversionRates.checkoutToSuccessPct = Number(
        (
          (summary.totalsByEvent.payment_success /
            summary.totalsByEvent.checkout_click) *
          100
        ).toFixed(1)
      );
    }

    return summary;
  } catch (err) {
    console.warn("[Analytics] Failed to aggregate daily funnel summary:", err);
    return emptyFunnelSummary(date);
  }
}
