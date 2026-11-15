"use client";

import { Suspense } from "react";
import PaymentSuccessView from "@/components/PaymentSuccessView";

export default function InterviewPaymentSuccessPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PaymentSuccessView
        confirmApiPath="/api/interview/payment"
        redirectPath="/interview"
        heading="면접 준비 결제 처리 중"
        doneMessage="결제가 성공적으로 완료되었습니다! 면접 꼬리질문 생성 페이지로 이동합니다."
      />
    </Suspense>
  );
}
