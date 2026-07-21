"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function InterviewPaymentSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState("결제 승인 중...");

  useEffect(() => {
    const paymentKey = searchParams.get("paymentKey");
    const orderId = searchParams.get("orderId");
    const amount = searchParams.get("amount");

    if (!paymentKey || !orderId || !amount) {
      setStatus("잘못된 접근입니다.");
      return;
    }

    const confirmPayment = async () => {
      try {
        const response = await fetch("/api/interview/payment", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            paymentKey,
            orderId,
            amount,
          }),
        });

        if (response.ok) {
          setStatus("결제가 성공적으로 완료되었습니다! 면접 꼬리질문 생성 페이지로 이동합니다...");
          setTimeout(() => {
            router.replace(`/interview?orderId=${orderId}`);
          }, 1500);
        } else {
          const errorData = await response.json();
          setStatus(`결제 승인 실패: ${errorData.message || "알 수 없는 오류"}`);
        }
      } catch (error) {
        console.error(error);
        setStatus("결제 승인 요청 중 네트워크 오류가 발생했습니다.");
      }
    };

    confirmPayment();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">면접 준비 결제 처리 중</h1>
        <p className="text-gray-600">{status}</p>
      </div>
    </div>
  );
}

export default function InterviewPaymentSuccessPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <InterviewPaymentSuccessContent />
    </Suspense>
  );
}
