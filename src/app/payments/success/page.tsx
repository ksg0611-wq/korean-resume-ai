import { Suspense } from "react";
import PaymentSuccessView from "@/components/PaymentSuccessView";
import { BUSINESS_INFO } from "@/lib/siteConfig";

export const dynamic = "force-dynamic";

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-gray-500">Loading...</div>}>
      <PaymentSuccessView
        confirmApiPath="/api/payments/success"
        redirectPath="/"
        heading="결제 처리 중"
        doneMessage="결제가 성공적으로 완료되었습니다!"
        kakaoChannelUrl={BUSINESS_INFO.kakaoChannelUrl}
      />
    </Suspense>
  );
}
