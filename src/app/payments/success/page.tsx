"use client";

import { Suspense } from "react";
import PaymentSuccessView from "@/components/PaymentSuccessView";

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PaymentSuccessView
        confirmApiPath="/api/payments/success"
        redirectPath="/"
        heading="결제 처리 중"
        doneMessage="결제가 성공적으로 완료되었습니다!"
      />
    </Suspense>
  );
}
