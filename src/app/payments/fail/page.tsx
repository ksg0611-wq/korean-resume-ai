"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { trackConversionEvent } from "@/lib/analytics";

function PaymentFailContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code") || "";
  const message =
    searchParams.get("message") || "결제가 취소되었거나 완료되지 않았습니다.";
  const orderId = searchParams.get("orderId") || "";
  const [sourceHomeHref, setSourceHomeHref] = useState("/");

  useEffect(() => {
    let planType: string = "unknown";
    let analyticsSource: "blog" | "jobs" | "direct" | undefined;

    if (orderId) {
      try {
        const rawMeta = localStorage.getItem(`paymentCheckoutMeta:${orderId}`);
        if (rawMeta) {
          const parsed = JSON.parse(rawMeta) as Record<string, unknown>;
          if (typeof parsed?.planType === "string") {
            planType = parsed.planType;
          }
          if (
            parsed?.analyticsSource === "blog" ||
            parsed?.analyticsSource === "jobs" ||
            parsed?.analyticsSource === "direct"
          ) {
            analyticsSource = parsed.analyticsSource;
          }
        }
      } catch {
        // ignore localStorage read failure
      }
    }

    if (planType === "interview_single" || planType === "interview_upgrade") {
      setSourceHomeHref("/interview");
    }

    trackConversionEvent({
      event: "payment_fail",
      source: analyticsSource,
      planType,
      dedupeKey: `payment_fail_page:${orderId || code || "unknown"}`,
    });
  }, [code, orderId]);

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12 text-gray-900">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-sm border border-gray-200 text-center space-y-4">
        <div className="inline-flex items-center px-3 py-1 rounded-full bg-red-50 text-red-700 border border-red-200 text-xs font-bold">
          결제 미완료
        </div>
        <h1 className="text-xl font-extrabold text-gray-900">
          결제가 완료되지 않았습니다
        </h1>
        <p className="text-sm text-gray-600 leading-relaxed break-keep">
          {message}
        </p>
        {code && (
          <p className="text-xs text-gray-400 font-mono">
            사유 코드: {code}
          </p>
        )}
        <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
          <Link
            href={sourceHomeHref}
            className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl transition-colors"
          >
            다시 결제·작성하러 가기 →
          </Link>
          <Link
            href="/interview"
            className="py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-sm rounded-xl transition-colors"
          >
            면접 시뮬레이터
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function PaymentFailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50 text-sm text-gray-600">
          결제 상태를 확인하는 중...
        </div>
      }
    >
      <PaymentFailContent />
    </Suspense>
  );
}
