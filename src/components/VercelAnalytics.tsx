"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

/**
 * Vercel Web Analytics (쿠키 미사용 · 비식별 방문 통계)
 * - 쿼리스트링(upgradeFrom·token·orderId 등)은 전송 전에 제거합니다.
 * - 재열람 경로 /result/{orderId}는 /result/[orderId]로 치환해 주문번호를 보내지 않습니다.
 * - 유입 분석용 utm_* 파라미터만 남깁니다.
 */
export function sanitizeAnalyticsUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.pathname = url.pathname.replace(/^\/result\/[^/]+/, "/result/[orderId]");
    const kept = new URLSearchParams();
    url.searchParams.forEach((value, key) => {
      if (key.startsWith("utm_")) kept.set(key, value);
    });
    url.search = kept.toString();
    url.hash = "";
    return url.toString();
  } catch {
    return rawUrl;
  }
}

function beforeSend(event: BeforeSendEvent): BeforeSendEvent | null {
  if (new URL(event.url, "https://korea-resume.com").pathname.startsWith("/admin")) {
    return null;
  }
  return { ...event, url: sanitizeAnalyticsUrl(event.url) };
}

export default function VercelAnalytics() {
  return <Analytics beforeSend={beforeSend} />;
}
