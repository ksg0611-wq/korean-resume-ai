import { Suspense } from "react";
import PaymentSuccessView from "@/components/PaymentSuccessView";
import { BUSINESS_INFO } from "@/lib/siteConfig";

export const dynamic = "force-dynamic";

export default function InterviewPaymentSuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-gray-500">Loading...</div>}>
      <PaymentSuccessView
        confirmApiPath="/api/interview/payment"
        redirectPath="/interview"
        heading="면접 준비 결제 처리 중"
        doneMessage="결제가 성공적으로 완료되었습니다! 면접 꼬리질문 생성 페이지로 이동합니다."
        kakaoChannelUrl={BUSINESS_INFO.kakaoChannelUrl}
      />
    </Suspense>
  );
}
