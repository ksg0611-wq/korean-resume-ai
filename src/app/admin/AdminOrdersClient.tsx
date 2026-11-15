"use client";

import { useState } from "react";
import type { AdminOrderFilter, AdminOrderSummary } from "@/lib/orders";
import type { OrderRecord } from "@/lib/results";

type AdminOrderRow = OrderRecord & { isMismatch?: boolean };

const STATUS_BADGE: Record<OrderRecord["status"], { label: string; cls: string }> = {
  paid: { label: "결제완료 · 미생성(paid)", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  generating: { label: "생성 중(generating)", cls: "bg-blue-100 text-blue-800 border-blue-200" },
  done: { label: "생성완료(done)", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
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
  const [filter, setFilter] = useState<AdminOrderFilter>("all");
  const [searchOrderId, setSearchOrderId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<AdminOrderSummary | null>(null);
  const [orders, setOrders] = useState<AdminOrderRow[]>([]);

  const fetchOrders = async (
    secret: string,
    nextFilter: AdminOrderFilter = filter,
    orderIdQuery: string = searchOrderId
  ) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ filter: nextFilter, limit: "150" });
      if (orderIdQuery.trim()) {
        params.set("orderId", orderIdQuery.trim());
      }

      const res = await fetch(`/api/admin/orders?${params.toString()}`, {
        method: "GET",
        headers: {
          "x-admin-secret": secret,
        },
        cache: "no-store",
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 401) {
          setAuthenticatedSecret(null);
        }
        setError(data?.error || `조회 실패 (HTTP ${res.status})`);
        return;
      }

      setAuthenticatedSecret(secret);
      setSummary(data.summary);
      setOrders(data.orders || []);
    } catch {
      setError("관리자 API 호출 중 네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secretInput.trim()) {
      setError("ADMIN_SECRET을 입력해 주세요.");
      return;
    }
    await fetchOrders(secretInput.trim(), filter, searchOrderId);
  };

  const handleFilterChange = async (nextFilter: AdminOrderFilter) => {
    setFilter(nextFilter);
    if (authenticatedSecret) {
      await fetchOrders(authenticatedSecret, nextFilter, searchOrderId);
    }
  };

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authenticatedSecret) {
      await fetchOrders(authenticatedSecret, filter, searchOrderId);
    }
  };

  if (!authenticatedSecret) {
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
              불일치(`paid` / `generating` / `failed`) 및 자동 환불(`refunded`) 주문을 실시간으로 점검합니다.
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
              onClick={() => {
                setAuthenticatedSecret(null);
                setSecretInput("");
                setOrders([]);
                setSummary(null);
              }}
              className="px-4 py-2 bg-white hover:bg-gray-100 border border-gray-300 text-gray-700 font-semibold text-xs rounded-lg cursor-pointer"
            >
              잠금(로그아웃)
            </button>
          </div>
        </div>

        {/* 요약 카드 */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            <div className="bg-white p-4 rounded-xl border border-gray-200">
              <p className="text-xs text-gray-500">전체 주문</p>
              <p className="text-2xl font-extrabold text-gray-900 mt-1">{summary.total}</p>
            </div>
            <div className="bg-amber-50 p-4 rounded-xl border border-amber-200">
              <p className="text-xs text-amber-800 font-semibold">불일치 점검 대상</p>
              <p className="text-2xl font-extrabold text-amber-900 mt-1">{summary.mismatchCount}</p>
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
              <p className="text-xs text-red-700 font-semibold">실패(failed)</p>
              <p className="text-2xl font-extrabold text-red-800 mt-1">{summary.failed}</p>
            </div>
          </div>
        )}

        {/* 필터 & 주문번호 검색 */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-gray-200">
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: "all", label: "전체 보기" },
                { id: "mismatch", label: "결제-생성 불일치 (paid/generating/failed)" },
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
                        <span className="text-[11px] text-gray-500">
                          {order.serviceType === "interview" ? "면접 꼬리질문" : "자기소개서"}
                        </span>
                      </td>
                      <td className="py-3 px-3 align-top">
                        <span className={`inline-block px-2 py-0.5 rounded-md border font-bold text-[11px] ${badge.cls}`}>
                          {badge.label}
                        </span>
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
