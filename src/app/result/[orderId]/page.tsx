import type { Metadata } from "next";
import Link from "next/link";
import { verifyAndGetStoredResult, buildResultUrl } from "@/lib/results";
import { getInterviewSession } from "@/lib/interviewSession";
import { BUSINESS_INFO } from "@/lib/siteConfig";
import { getServerPaymentLockState } from "@/lib/paymentAccess";
import ResultViewClient from "./ResultViewClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "생성 결과 재열람 | Korea Resume AI",
  robots: { index: false, follow: false },
};

export default async function ResultPage({
  params,
  searchParams,
}: {
  params: { orderId: string };
  searchParams: { token?: string };
}) {
  const orderId = decodeURIComponent(params.orderId || "");
  const token = typeof searchParams?.token === "string" ? searchParams.token : null;
  const { paymentLocked } = getServerPaymentLockState();

  const outcome = await verifyAndGetStoredResult(orderId, token);

  if (outcome.status !== 200) {
    return (
      <main className="flex-1 bg-gray-50 flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl border border-gray-200 text-center space-y-4">
          <h1 className="text-xl font-bold text-gray-900">
            {outcome.status === 410
              ? "결과 재열람 기간(7일)이 만료되었습니다."
              : "유효하지 않은 재열람 링크입니다."}
          </h1>
          <p className="text-sm text-gray-600">
            {outcome.status === 410
              ? "보안을 위해 생성 결과물은 7일 보관 후 자동 파기됩니다."
              : "토큰이 일치하지 않거나 접근 권한이 없습니다."}
          </p>
          {outcome.status === 410 && outcome.serviceType === "resume" && token && (
            paymentLocked ? (
              <div className="pt-2">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700">
                  결제 서비스 준비 중입니다
                </div>
              </div>
            ) : (
              <div className="pt-2 space-y-2">
                <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                  자소서 본문은 파기되었지만, 기존 결제 주문의 <strong>+3,000원 면접 시뮬레이터 업그레이드 할인</strong>은 계속 이용하실 수 있습니다.
                </p>
                <Link
                  href={`/interview?upgradeFrom=${encodeURIComponent(orderId)}&token=${encodeURIComponent(token)}`}
                  className="inline-block w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl transition-colors"
                >
                  +3,000원 면접 업그레이드 이동 (원문 재입력 안내) →
                </Link>
              </div>
            )
          )}
        </div>
      </main>
    );
  }

  const { order, result } = outcome;
  const activeSessionId =
    order.activeSessionId || result.interviewSessionId || null;

  let remainingEvaluations =
    result.interviewNote?.remainingEvaluations ?? null;
  let maxEvaluations = result.interviewNote?.maxEvaluations ?? null;

  if (result.serviceType === "interview" && activeSessionId) {
    const liveSession = await getInterviewSession(activeSessionId);
    if (liveSession) {
      remainingEvaluations = liveSession.remainingEvaluations;
      maxEvaluations = liveSession.maxEvaluations;
    }
  }

  return (
    <ResultViewClient
      orderId={result.orderId}
      serviceType={result.serviceType}
      planType={order.planType ?? null}
      linkedInterviewOrderId={
        order.linkedInterviewOrderId ?? result.linkedInterviewOrderId ?? null
      }
      upgradedToInterviewOrderId={order.upgradedToInterviewOrderId ?? null}
      title={result.title}
      text={result.text}
      items={result.items ?? null}
      interviewQuestions={result.interviewQuestions ?? null}
      interviewPending={Boolean(result.interviewPending)}
      interviewSessionId={activeSessionId}
      interviewNote={result.interviewNote ?? null}
      remainingEvaluations={remainingEvaluations}
      maxEvaluations={maxEvaluations}
      resultToken={result.token}
      createdAt={result.createdAt}
      expiresAt={result.expiresAt}
      receiptUrl={result.receiptUrl ?? order.receiptUrl ?? null}
      remainingGenerations={order.remainingGenerations}
      resultUrl={buildResultUrl(result.orderId, result.token)}
      kakaoChannelUrl={BUSINESS_INFO.kakaoChannelUrl}
      paymentLocked={paymentLocked}
    />
  );
}
