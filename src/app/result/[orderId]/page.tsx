import type { Metadata } from "next";
import { verifyAndGetStoredResult, buildResultUrl } from "@/lib/results";
import { BUSINESS_INFO } from "@/lib/siteConfig";
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

  const outcome = await verifyAndGetStoredResult(orderId, token);

  if (outcome.status !== 200) {
    return (
      <main className="flex-1 bg-gray-50 flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl border border-gray-200 text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            {outcome.status === 410
              ? "결과 재열람 기간(7일)이 만료되었습니다."
              : "유효하지 않은 재열람 링크입니다."}
          </h1>
          <p className="text-sm text-gray-600 mb-6">
            {outcome.status === 410
              ? "보안을 위해 생성 결과물은 7일 보관 후 자동 파기됩니다."
              : "토큰이 일치하지 않거나 접근 권한이 없습니다."}
          </p>
        </div>
      </main>
    );
  }

  const { order, result } = outcome;
  return (
    <ResultViewClient
      orderId={result.orderId}
      serviceType={result.serviceType}
      title={result.title}
      text={result.text}
      items={result.items ?? null}
      interviewQuestions={result.interviewQuestions ?? null}
      interviewPending={Boolean(result.interviewPending)}
      resultToken={result.token}
      createdAt={result.createdAt}
      expiresAt={result.expiresAt}
      receiptUrl={result.receiptUrl ?? order.receiptUrl ?? null}
      remainingGenerations={order.remainingGenerations}
      resultUrl={buildResultUrl(result.orderId, result.token)}
      kakaoChannelUrl={BUSINESS_INFO.kakaoChannelUrl}
    />
  );
}
