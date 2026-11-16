"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { DailyFreeMetricsSummary } from "@/lib/freeMetrics";
import type { DailyFunnelSummary } from "@/lib/analyticsServer";
import type { AnalyticsEventName } from "@/lib/analytics";
import type { AdminOrderFilter, AdminOrderSummary } from "@/lib/orders";
import type { OrderRecord } from "@/lib/results";

const FUNNEL_EVENT_LABELS: Record<AnalyticsEventName, string> = {
  job_cta_click: "공고 상세 CTA 클릭 (job_cta_click)",
  diagnose_run: "무료 자소서 진단 (diagnose_run)",
  draft_run: "무료 미리보기 생성 (draft_run)",
  interview_free_run: "무료 면접 체험 (interview_free_run)",
  checkout_click: "결제하기 클릭 (checkout_click)",
  payment_success: "결제 승인 완료 (payment_success)",
  payment_fail: "결제 실패·취소 (payment_fail)",
};

type AdminOrderRow = OrderRecord & { isMismatch?: boolean; isStuck?: boolean };

const STATUS_BADGE: Record<OrderRecord["status"], { label: string; cls: string }> = {
  paid: { label: "결제완료 · 미생성(paid)", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  generating: { label: "생성 중(generating)", cls: "bg-blue-100 text-blue-800 border-blue-200" },
  done: { label: "생성완료(done)", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  interview_pending: { label: "면접 미완료 · 부분점검(interview_pending)", cls: "bg-amber-100 text-amber-900 border-amber-300" },
  refunded: { label: "자동전액환불(refunded)", cls: "bg-purple-100 text-purple-800 border-purple-200" },
  refund_failed: { label: "환불처리중·확인(refund_failed)", cls: "bg-red-100 text-red-800 border-red-200" },
  failed: { label: "실패·점검필요(failed)", cls: "bg-red-100 text-red-800 border-red-200" },
};

function fmtTime(iso?: string | null): string {
  if (!iso) return "-";
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function AdminOrdersClient() {
  const [secretInput, setSecretInput] = useState("");
  const [authenticatedSecret, setAuthenticatedSecret] = useState<string | null>(null);
  const [isCookieAuthenticated, setIsCookieAuthenticated] = useState(false);
  const [testPaymentMode, setTestPaymentMode] = useState(false);
  const [filter, setFilter] = useState<AdminOrderFilter>("all");
  const [searchOrderId, setSearchOrderId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [freeMetrics, setFreeMetrics] = useState<DailyFreeMetricsSummary | null>(null);
  const [analyticsFunnel, setAnalyticsFunnel] = useState<DailyFunnelSummary | null>(null);
  const [analyticsDate, setAnalyticsDate] = useState("");
  const [summary, setSummary] = useState<AdminOrderSummary | null>(null);
  const [orders, setOrders] = useState<AdminOrderRow[]>([]);

  const fetchOrders = async (
    secret: string | null,
    nextFilter: AdminOrderFilter = filter,
    orderIdQuery: string = searchOrderId,
    nextAnalyticsDate: string = analyticsDate
  ) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ filter: nextFilter, limit: "150" });
      if (orderIdQuery.trim()) {
        params.set("orderId", orderIdQuery.trim());
      }
      if (nextAnalyticsDate.trim()) {
        params.set("analyticsDate", nextAnalyticsDate.trim());
      }

      const headers: Record<string, string> = {};
      if (secret) {
        headers["x-admin-secret"] = secret;
      }

      const res = await fetch(`/api/admin/orders?${params.toString()}`, {
        method: "GET",
        headers,
        credentials: "include",
        cache: "no-store",
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 401) {
          setAuthenticatedSecret(null);
          setIsCookieAuthenticated(false);
        }
        setError(data?.error || `조회 실패 (HTTP ${res.status})`);
        return;
      }

      if (secret) {
        setAuthenticatedSecret(secret);
      }
      setIsCookieAuthenticated(true);
      setTestPaymentMode(Boolean(data.testPaymentMode));
      setFreeMetrics(data.freeMetrics || null);
      setAnalyticsFunnel(data.analyticsFunnel || null);
      if (!nextAnalyticsDate && data.analyticsFunnel?.date) {
        setAnalyticsDate(data.analyticsFunnel.date);
      }
      setSummary(data.summary);
      setOrders(data.orders || []);
    } catch {
      setError("관리자 API 호출 중 네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    fetch("/api/admin/session", { credentials: "include", cache: "no-store" })
      .then((res) => res.json().catch(() => null))
      .then((data) => {
        if (!active || !data) return;
        setTestPaymentMode(Boolean(data.testPaymentMode));
        if (data.authenticated) {
          setIsCookieAuthenticated(true);
          fetchOrders(null, "all", "");
        }
      })
      .catch(() => {
        // ignore startup check error
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSecret = secretInput.trim();
    if (!cleanSecret) {
      setError("ADMIN_SECRET을 입력해 주세요.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const sessionRes = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ secret: cleanSecret }),
      });
      const sessionData = await sessionRes.json().catch(() => null);
      if (!sessionRes.ok) {
        setLoading(false);
        setError(sessionData?.error || `인증 실패 (HTTP ${sessionRes.status})`);
        return;
      }
      setTestPaymentMode(Boolean(sessionData?.testPaymentMode));
      setIsCookieAuthenticated(true);
      await fetchOrders(cleanSecret, filter, searchOrderId);
    } catch {
      setLoading(false);
      setError("관리자 세션 발급 중 네트워크 오류가 발생했습니다.");
    }
  };

  const handleFilterChange = async (nextFilter: AdminOrderFilter) => {
    setFilter(nextFilter);
    if (isCookieAuthenticated || authenticatedSecret) {
      await fetchOrders(authenticatedSecret, nextFilter, searchOrderId);
    }
  };

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCookieAuthenticated || authenticatedSecret) {
      await fetchOrders(authenticatedSecret, filter, searchOrderId);
    }
  };

  if (!isCookieAuthenticated && !authenticatedSecret) {
    return (
      <main className="flex-1 bg-gray-50 flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
          <h1 className="text-xl font-extrabold text-gray-900 mb-2">
            관리자 주문 · 환불 상태 조회
          </h1>
          <p className="text-xs text-gray-500 mb-6">
            결제됨(`paid`/`failed`) 대비 생성완료(`done`) 불일치 주문 및 자동 환불 내역을 확인하려면 `ADMIN_SECRET`을 입력하세요.
          </p>

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label htmlFor="admin-secret-input" className="block text-xs font-bold text-gray-700 mb-1">
                ADMIN_SECRET
              </label>
              <input
                id="admin-secret-input"
                type="password"
                value={secretInput}
                onChange={(e) => setSecretInput(e.target.value)}
                placeholder="관리자 시크릿 키 입력"
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                autoComplete="off"
              />
            </div>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold text-sm rounded-xl cursor-pointer"
            >
              {loading ? "인증 확인 중..." : "관리자 조회 접속"}
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 bg-gray-50 py-8 px-4 sm:px-6 lg:px-8 text-gray-900">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900">
              결제 · 생성 상태 & 자동 환불 점검 대시보드
            </h1>
            <p className="text-xs text-gray-500 mt-1">
              불일치(`paid` / `generating` / `refund_failed` / `failed`), 180초 이상 고착(`stuck`), 자동 환불(`refunded`) 주문을 실시간으로 점검합니다.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fetchOrders(authenticatedSecret, filter, searchOrderId)}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg cursor-pointer"
            >
              {loading ? "불러오는 중..." : "새로고침 ↻"}
            </button>
            <button
              type="button"
              onClick={async () => {
                await fetch("/api/admin/session", {
                  method: "DELETE",
                  credentials: "include",
                }).catch(() => {});
                setAuthenticatedSecret(null);
                setIsCookieAuthenticated(false);
                setSecretInput("");
                setOrders([]);
                setFreeMetrics(null);
                setAnalyticsFunnel(null);
                setSummary(null);
              }}
              className="px-4 py-2 bg-white hover:bg-gray-100 border border-gray-300 text-gray-700 font-semibold text-xs rounded-lg cursor-pointer"
            >
              잠금(로그아웃)
            </button>
          </div>
        </div>

        {/* 관리자 세션 쿠키 및 테스트 결제 잠금 안내 배너 */}
        <div
          className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-3 text-xs ${
            testPaymentMode
              ? "bg-blue-50 border-blue-200 text-blue-900"
              : "bg-emerald-50 border-emerald-200 text-emerald-900"
          }`}
        >
          <div className="space-y-0.5">
            <p className="font-bold">
              {testPaymentMode
                ? "결제 잠금 모드 활성화됨 (live_ 키 미설정 · 일반 방문자 차단 중)"
                : "관리자 세션 쿠키 활성화됨 (live_ 라이브 결제 모드)"}
            </p>
            <p className="opacity-85">
              현재 브라우저(모바일·카카오톡 인앱 포함)에서 일반 사용자에게 숨겨진 결제창·API 테스트가 가능합니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/"
              className="px-3 py-1.5 bg-white border border-blue-200 text-blue-700 hover:bg-blue-100 font-bold rounded-lg"
            >
              홈 결제창 이동 →
            </Link>
            <Link
              href="/interview"
              className="px-3 py-1.5 bg-white border border-blue-200 text-blue-700 hover:bg-blue-100 font-bold rounded-lg"
            >
              면접 결제창 이동 →
            </Link>
          </div>
        </div>

        {/* 오늘(KST) 무료 AI 경로 일일 호출 수 및 추정 원가 + 서킷 브레이커 상태 */}
        {freeMetrics && (
          <section className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3">
              <div>
                <h2 className="text-sm sm:text-base font-extrabold text-gray-900">
                  오늘의 무료 경로 일일 호출 · 추정 원가 ({freeMetrics.date} KST)
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Redis 키 <code className="bg-gray-100 px-1 py-0.5 rounded">metrics:free:{freeMetrics.date}:*</code> 집계 기준 · 2027.01+ 정식 단가 환산 추정치
                </p>
              </div>
              <span
                className={`text-xs font-bold px-3 py-1.5 rounded-full border ${
                  freeMetrics.circuitBreakerOpen
                    ? "bg-red-50 text-red-700 border-red-200"
                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
                }`}
              >
                {freeMetrics.circuitBreakerOpen
                  ? `서킷 브레이커 작동 (${freeMetrics.limit}회 초과 · 3.8-flash 전환)`
                  : `서킷 브레이커 정상 (${freeMetrics.counts.draft}/${freeMetrics.limit}회)`}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <p className="text-xs text-slate-600 font-semibold">무료 자소서 진단 (3.8-flash)</p>
                <p className="text-xl font-extrabold text-slate-900 mt-1">
                  {freeMetrics.counts.diagnose.toLocaleString("ko-KR")}회
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  추정 원가 약 {Math.round(freeMetrics.estimatedCostKrw.diagnose).toLocaleString("ko-KR")}원
                </p>
              </div>

              <div className="bg-blue-50 p-3.5 rounded-xl border border-blue-200">
                <p className="text-xs text-blue-800 font-semibold">무료 미리보기 (draft)</p>
                <p className="text-xl font-extrabold text-blue-950 mt-1">
                  {freeMetrics.counts.draft.toLocaleString("ko-KR")} / {freeMetrics.limit}회
                </p>
                <p className="text-xs text-blue-700 mt-1">
                  4-hydrogen {freeMetrics.counts.draftHydrogen} · 전환 {freeMetrics.counts.draftFallback} · 약{" "}
                  {Math.round(freeMetrics.estimatedCostKrw.draft).toLocaleString("ko-KR")}원
                </p>
              </div>

              <div className="bg-indigo-50 p-3.5 rounded-xl border border-indigo-200">
                <p className="text-xs text-indigo-800 font-semibold">무료 면접 체험 (3.8-flash)</p>
                <p className="text-xl font-extrabold text-indigo-950 mt-1">
                  생성 {freeMetrics.counts.interviewGen.toLocaleString("ko-KR")} · 채점{" "}
                  {freeMetrics.counts.interviewEval.toLocaleString("ko-KR")}
                </p>
                <p className="text-xs text-indigo-700 mt-1">
                  추정 원가 약 {Math.round(freeMetrics.estimatedCostKrw.interview).toLocaleString("ko-KR")}원
                </p>
              </div>

              <div className="bg-emerald-50 p-3.5 rounded-xl border border-emerald-200">
                <p className="text-xs text-emerald-800 font-semibold">오늘 무료 총 추정 원가</p>
                <p className="text-xl font-extrabold text-emerald-900 mt-1">
                  약 {Math.round(freeMetrics.estimatedCostKrw.total).toLocaleString("ko-KR")}원
                </p>
                <p className="text-xs text-emerald-700 mt-1">
                  총 {freeMetrics.counts.totalCalls.toLocaleString("ko-KR")}회 호출
                  {freeMetrics.alertedAt ? ` · 알림 ${fmtTime(freeMetrics.alertedAt)}` : ""}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* 전환 퍼널 일별 · 유입경로별 집계 (analytics:funnel:YYYY-MM-DD:*) */}
        {analyticsFunnel && (
          <section className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
              <div>
                <h2 className="text-sm sm:text-base font-extrabold text-gray-900">
                  전환 퍼널 일별 · 유입경로별 집계 ({analyticsFunnel.date} KST)
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Redis 비식별 카운터 <code className="bg-gray-100 px-1 py-0.5 rounded">{analyticsFunnel.redisKeyPattern}</code> · 개인정보 미수집
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <input
                  type="date"
                  value={analyticsDate || analyticsFunnel.date}
                  onChange={(e) => {
                    const nextDate = e.target.value;
                    setAnalyticsDate(nextDate);
                    if (isCookieAuthenticated || authenticatedSecret) {
                      fetchOrders(authenticatedSecret, filter, searchOrderId, nextDate);
                    }
                  }}
                  className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs"
                  aria-label="퍼널 조회 일자"
                />
                <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-semibold border border-slate-200">
                  체험→결제시도{" "}
                  {analyticsFunnel.conversionRates.draftToCheckoutPct !== null
                    ? `${analyticsFunnel.conversionRates.draftToCheckoutPct}%`
                    : "-"}
                </span>
                <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                  결제시도→성공{" "}
                  {analyticsFunnel.conversionRates.checkoutToSuccessPct !== null
                    ? `${analyticsFunnel.conversionRates.checkoutToSuccessPct}%`
                    : "-"}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5 text-xs">
              <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                <p className="text-gray-500 font-semibold">direct 유입 이벤트</p>
                <p className="text-lg font-extrabold text-gray-900 mt-0.5">
                  {analyticsFunnel.totalsBySource.direct.toLocaleString("ko-KR")}건
                </p>
              </div>
              <div className="bg-blue-50 p-3 rounded-xl border border-blue-200">
                <p className="text-blue-700 font-semibold">jobs(채용공고) 유입 이벤트</p>
                <p className="text-lg font-extrabold text-blue-950 mt-0.5">
                  {analyticsFunnel.totalsBySource.jobs.toLocaleString("ko-KR")}건
                </p>
              </div>
              <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-200">
                <p className="text-indigo-700 font-semibold">blog(블로그) 유입 이벤트</p>
                <p className="text-lg font-extrabold text-indigo-950 mt-0.5">
                  {analyticsFunnel.totalsBySource.blog.toLocaleString("ko-KR")}건
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-gray-600">
                    <th className="py-2.5 px-3 font-bold">이벤트</th>
                    <th className="py-2.5 px-3 font-bold text-right">합계</th>
                    <th className="py-2.5 px-3 font-bold text-right">blog</th>
                    <th className="py-2.5 px-3 font-bold text-right">jobs</th>
                    <th className="py-2.5 px-3 font-bold text-right">direct</th>
                    <th className="py-2.5 px-3 font-bold">상품별 분포 (planType)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {analyticsFunnel.rows.map((row) => {
                    const planEntries = Object.entries(row.byPlanType).filter(
                      ([, count]) => count > 0
                    );
                    return (
                      <tr key={row.event} className="hover:bg-gray-50/70">
                        <td className="py-2 px-3 font-semibold text-gray-900">
                          {FUNNEL_EVENT_LABELS[row.event] || row.event}
                        </td>
                        <td className="py-2 px-3 text-right font-extrabold text-gray-900">
                          {row.total.toLocaleString("ko-KR")}
                        </td>
                        <td className="py-2 px-3 text-right text-indigo-700 font-semibold">
                          {row.bySource.blog.toLocaleString("ko-KR")}
                        </td>
                        <td className="py-2 px-3 text-right text-blue-700 font-semibold">
                          {row.bySource.jobs.toLocaleString("ko-KR")}
                        </td>
                        <td className="py-2 px-3 text-right text-gray-700 font-semibold">
                          {row.bySource.direct.toLocaleString("ko-KR")}
                        </td>
                        <td className="py-2 px-3 text-gray-600">
                          {planEntries.length > 0
                            ? planEntries
                                .map(([plan, count]) => `${plan}:${count}`)
                                .join(" · ")
                            : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* 요약 카드 */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <div className="bg-white p-4 rounded-xl border border-gray-200">
              <p className="text-xs text-gray-500">전체 주문</p>
              <p className="text-2xl font-extrabold text-gray-900 mt-1">{summary.total}</p>
            </div>
            <div className="bg-amber-50 p-4 rounded-xl border border-amber-200">
              <p className="text-xs text-amber-800 font-semibold">불일치 점검 대상</p>
              <p className="text-2xl font-extrabold text-amber-900 mt-1">{summary.mismatchCount}</p>
            </div>
            <div className="bg-orange-50 p-4 rounded-xl border border-orange-200">
              <p className="text-xs text-orange-800 font-semibold">고착 (stuck · 180초+)</p>
              <p className="text-2xl font-extrabold text-orange-900 mt-1">{summary.stuck}</p>
            </div>
            <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200">
              <p className="text-xs text-emerald-700 font-semibold">생성 완료(done)</p>
              <p className="text-2xl font-extrabold text-emerald-800 mt-1">{summary.done}</p>
            </div>
            <div className="bg-purple-50 p-4 rounded-xl border border-purple-200">
              <p className="text-xs text-purple-700 font-semibold">자동 환불(refunded)</p>
              <p className="text-2xl font-extrabold text-purple-800 mt-1">{summary.refunded}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-gray-200">
              <p className="text-xs text-gray-500">결제 대기(paid)</p>
              <p className="text-2xl font-extrabold text-gray-800 mt-1">{summary.paid}</p>
            </div>
            <div className="bg-red-50 p-4 rounded-xl border border-red-200">
              <p className="text-xs text-red-700 font-semibold">환불실패·오류</p>
              <p className="text-2xl font-extrabold text-red-800 mt-1">
                {summary.refundFailed + summary.failed}
              </p>
            </div>
          </div>
        )}

        {/* 필터 & 주문번호 검색 */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-gray-200">
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: "all", label: "전체 보기" },
                { id: "mismatch", label: "결제-생성 불일치 (paid/generating/refund_failed)" },
                { id: "stuck", label: "고착 (stuck · 180초+)" },
                { id: "refunded", label: "자동 환불 내역 (refunded)" },
                { id: "done", label: "생성 완료 (done)" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleFilterChange(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                  filter === tab.id
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <input
              type="text"
              value={searchOrderId}
              onChange={(e) => setSearchOrderId(e.target.value)}
              placeholder="주문번호(orderId) 직접 조회"
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs w-52 focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-900 text-white font-bold text-xs rounded-lg cursor-pointer"
            >
              조회
            </button>
          </form>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs">
            {error}
          </div>
        )}

        {/* 테이블 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto shadow-xs">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-600">
                <th className="py-3 px-3 font-bold">주문번호 / 서비스</th>
                <th className="py-3 px-3 font-bold">상태</th>
                <th className="py-3 px-3 font-bold">금액</th>
                <th className="py-3 px-3 font-bold">사용/잔여</th>
                <th className="py-3 px-3 font-bold">이메일</th>
                <th className="py-3 px-3 font-bold">결제·생성·환불 시각 (KST)</th>
                <th className="py-3 px-3 font-bold">Toss paymentKey / 영수증</th>
                <th className="py-3 px-3 font-bold">오류/환불 사유</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-gray-500">
                    표시할 주문 내역이 없습니다.
                  </td>
                </tr>
              ) : (
                orders.map((order) => {
                  const badge = STATUS_BADGE[order.status] || {
                    label: order.status,
                    cls: "bg-gray-100 text-gray-700 border-gray-200",
                  };
                  return (
                    <tr
                      key={`${order.serviceType}:${order.orderId}`}
                      className={order.isMismatch ? "bg-amber-50/40" : undefined}
                    >
                      <td className="py-3 px-3 align-top">
                        <div className="font-mono font-bold text-gray-900">{order.orderId}</div>
                        <div className="flex flex-wrap items-center gap-1 mt-0.5">
                          <span className="text-[11px] text-gray-500">
                            {order.serviceType === "interview" ? "면접 시뮬레이터" : "자기소개서"}
                          </span>
                          {order.planType && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200">
                              {order.planType === "bundle"
                                ? "통합 7,900"
                                : order.planType === "bundle_companion"
                                  ? "통합 연동"
                                  : order.planType === "interview_upgrade"
                                    ? "업그레이드 +3,000"
                                    : order.planType === "interview_single"
                                      ? "면접 단독"
                                      : "자소서 단독"}
                            </span>
                          )}
                        </div>
                        {order.linkedInterviewOrderId && (
                          <div className="text-[10px] text-emerald-700 font-mono mt-0.5">
                            연동 면접: {order.linkedInterviewOrderId}
                          </div>
                        )}
                        {order.upgradedToInterviewOrderId && (
                          <div className="text-[10px] text-blue-700 font-mono mt-0.5">
                            업그레이드: {order.upgradedToInterviewOrderId}
                          </div>
                        )}
                        {order.baseOrderId && (
                          <div className="text-[10px] text-gray-500 font-mono mt-0.5">
                            기준 자소서: {order.baseOrderId}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 align-top">
                        <span className={`inline-block px-2 py-0.5 rounded-md border font-bold text-[11px] ${badge.cls}`}>
                          {badge.label}
                        </span>
                        {order.isStuck && (
                          <div className="mt-1">
                            <span className="inline-block px-2 py-0.5 rounded-md border font-bold text-[10px] bg-orange-100 text-orange-800 border-orange-300">
                              고착(stuck 180초+)
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 align-top font-semibold whitespace-nowrap">
                        {order.amount.toLocaleString("ko-KR")}원
                        {order.refundAmount ? (
                          <div className="text-[11px] text-purple-700">
                            환불: {order.refundAmount.toLocaleString("ko-KR")}원
                          </div>
                        ) : null}
                      </td>
                      <td className="py-3 px-3 align-top whitespace-nowrap">
                        사용 {order.usedCount} / 잔여 {order.remainingGenerations}
                      </td>
                      <td className="py-3 px-3 align-top break-all max-w-[160px]">
                        {order.email || "-"}
                      </td>
                      <td className="py-3 px-3 align-top whitespace-nowrap space-y-0.5 text-[11px] text-gray-600">
                        <div>결제: {fmtTime(order.paidAt)}</div>
                        {order.generatingAt && <div>시작: {fmtTime(order.generatingAt)}</div>}
                        {order.doneAt && <div>완료: {fmtTime(order.doneAt)}</div>}
                        {order.refundedAt && <div className="text-purple-700">환불: {fmtTime(order.refundedAt)}</div>}
                        {order.failedAt && <div className="text-red-600">실패: {fmtTime(order.failedAt)}</div>}
                      </td>
                      <td className="py-3 px-3 align-top max-w-[180px] break-all">
                        <div className="font-mono text-[11px] text-gray-700">
                          {order.paymentKey || "-"}
                        </div>
                        {order.receiptUrl && (
                          <a
                            href={order.receiptUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 underline text-[11px]"
                          >
                            영수증 ↗
                          </a>
                        )}
                      </td>
                      <td className="py-3 px-3 align-top max-w-[220px] break-words text-[11px] text-gray-600">
                        {order.refundReason || order.lastError || "-"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
