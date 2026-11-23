/**
 * 비식별 전환 퍼널 측정 (클라이언트·공용)
 *
 * - 수집 이벤트 8종: diagnose_run, draft_run, checkout_click, payment_success, payment_fail, job_cta_click, interview_free_run, launch_notify_signup
 * - 개인정보 보호 원칙: 자소서 본문, 이메일, 이름, 주문번호, IP 등 PII는 절대 수집·전송하지 않습니다.
 * - 유입 경로(source)와 상품 유형(planType)만 허용 목록으로 정규화해 GA4(gtag) 및 Redis 비식별 퍼널 API로 기록합니다.
 */

export const ANALYTICS_EVENTS = [
  "diagnose_run",
  "draft_run",
  "checkout_click",
  "payment_success",
  "payment_fail",
  "job_cta_click",
  "interview_free_run",
  "launch_notify_signup",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

export const ANALYTICS_SOURCES = ["blog", "jobs", "direct"] as const;
export type AnalyticsSource = (typeof ANALYTICS_SOURCES)[number];

export const ANALYTICS_PLAN_TYPES = [
  "free",
  "resume_single",
  "interview_single",
  "bundle",
  "interview_upgrade",
  "unknown",
] as const;

export type AnalyticsPlanType = (typeof ANALYTICS_PLAN_TYPES)[number];

const SESSION_SOURCE_STORAGE_KEY = "kr_analytics_source";
const DEDUPE_STORAGE_PREFIX = "kr_analytics_dedupe:";

const EVENT_SET = new Set<string>(ANALYTICS_EVENTS);
const SOURCE_SET = new Set<string>(ANALYTICS_SOURCES);
const PLAN_TYPE_SET = new Set<string>(ANALYTICS_PLAN_TYPES);

export function sanitizeAnalyticsEventName(
  value: unknown
): AnalyticsEventName | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return EVENT_SET.has(trimmed) ? (trimmed as AnalyticsEventName) : null;
}

export function sanitizeAnalyticsSource(value: unknown): AnalyticsSource {
  if (typeof value !== "string") return "direct";
  const trimmed = value.trim().toLowerCase();
  return SOURCE_SET.has(trimmed) ? (trimmed as AnalyticsSource) : "direct";
}

export function sanitizeAnalyticsPlanType(value: unknown): AnalyticsPlanType {
  if (typeof value !== "string") return "unknown";
  const trimmed = value.trim();
  if (trimmed === "bundle_companion") return "bundle";
  return PLAN_TYPE_SET.has(trimmed) ? (trimmed as AnalyticsPlanType) : "unknown";
}

function readStoredSessionSource(): AnalyticsSource | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_SOURCE_STORAGE_KEY);
    if (!raw) return null;
    return SOURCE_SET.has(raw) ? (raw as AnalyticsSource) : null;
  } catch {
    return null;
  }
}

function writeStoredSessionSource(source: AnalyticsSource): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SESSION_SOURCE_STORAGE_KEY, source);
  } catch {
    // ignore storage restriction
  }
}

export function detectSourceFromPathAndSearch(
  pathname: string,
  search: string = "",
  referrerPathname: string = ""
): AnalyticsSource | null {
  const normalizedPath = pathname.toLowerCase();
  if (normalizedPath === "/blog" || normalizedPath.startsWith("/blog/")) {
    return "blog";
  }
  if (normalizedPath === "/jobs" || normalizedPath.startsWith("/jobs/")) {
    return "jobs";
  }

  try {
    const params = new URLSearchParams(search);
    const snParam = params.get("sn");
    if (snParam && /^\d+$/.test(snParam.trim())) {
      return "jobs";
    }
    const utmOrRef = params.get("source") || params.get("utm_source");
    if (utmOrRef === "blog" || utmOrRef === "jobs") {
      return utmOrRef;
    }
  } catch {
    // ignore query parse error
  }

  const refPath = referrerPathname.toLowerCase();
  if (refPath === "/blog" || refPath.startsWith("/blog/")) {
    return "blog";
  }
  if (refPath === "/jobs" || refPath.startsWith("/jobs/")) {
    return "jobs";
  }

  return null;
}

/**
 * 현재 페이지 경로와 리퍼러로부터 세션 유입 경로(blog/jobs/direct)를 동기화
 */
export function syncAnalyticsSourceFromLocation(): AnalyticsSource {
  if (typeof window === "undefined") return "direct";

  let referrerPath = "";
  try {
    if (document.referrer) {
      const refUrl = new URL(document.referrer);
      if (refUrl.origin === window.location.origin) {
        referrerPath = refUrl.pathname;
      }
    }
  } catch {
    // ignore invalid referrer
  }

  const detected = detectSourceFromPathAndSearch(
    window.location.pathname,
    window.location.search,
    referrerPath
  );
  if (detected) {
    writeStoredSessionSource(detected);
    return detected;
  }

  const existing = readStoredSessionSource();
  if (existing) {
    return existing;
  }

  writeStoredSessionSource("direct");
  return "direct";
}

export function getSessionAnalyticsSource(): AnalyticsSource {
  if (typeof window === "undefined") return "direct";
  return syncAnalyticsSourceFromLocation();
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function consumeDedupeOnce(dedupeKey?: string): boolean {
  if (!dedupeKey || typeof window === "undefined") return true;
  try {
    const key = `${DEDUPE_STORAGE_PREFIX}${dedupeKey}`;
    if (window.sessionStorage.getItem(key)) {
      return false;
    }
    window.sessionStorage.setItem(key, "1");
    return true;
  } catch {
    return true;
  }
}

/**
 * 비식별 전환 이벤트 기록 (GA4 gtag + 서버 Redis 퍼널 집계)
 * - PII는 파라미터 인터페이스에서 원천 차단됩니다.
 */
export function trackConversionEvent(options: {
  event: AnalyticsEventName;
  source?: AnalyticsSource;
  planType?: string | null;
  dedupeKey?: string;
}): void {
  const event = sanitizeAnalyticsEventName(options.event);
  if (!event) return;

  if (!consumeDedupeOnce(options.dedupeKey)) {
    return;
  }

  const source = options.source
    ? sanitizeAnalyticsSource(options.source)
    : getSessionAnalyticsSource();
  const planType = sanitizeAnalyticsPlanType(options.planType ?? "unknown");

  if (typeof window !== "undefined" && typeof window.gtag === "function") {
    try {
      window.gtag("event", event, {
        funnel_source: source,
        plan_type: planType,
      });
    } catch {
      // ignore gtag runtime error
    }
  }

  if (typeof window === "undefined") return;

  try {
    void fetch("/api/analytics/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        source,
        planType,
      }),
      keepalive: true,
    }).catch(() => {
      // 분석 실패는 사용자 흐름에 영향 주지 않음
    });
  } catch {
    // ignore fetch init error
  }
}
