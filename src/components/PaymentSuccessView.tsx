"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BUSINESS_INFO } from "@/lib/siteConfig";
import { RESULT_TTL_DAYS } from "@/lib/policy";

interface PaymentSuccessViewProps {
  /** 결제 승인 API 경로 */
  confirmApiPath: string;
  /** 승인 완료 후 이동할 경로 (orderId 쿼리가 자동으로 붙습니다) */
  redirectPath: string;
  heading: string;
  doneMessage: string;
  /** 서버에서 주입하는 카카오톡 채널 URL (미설정 시 siteConfig 폴백) */
  kakaoChannelUrl?: string | null;
}

const REDIRECT_DELAY_MS = 8000;

/** 결제 승인 + 영수증/현금영수증/카카오톡 문의 안내 (자소서·면접 결제 완료 화면 공통) */
export default function PaymentSuccessView({
  confirmApiPath,
  redirectPath,
  heading,
  doneMessage,
  kakaoChannelUrl,
}: PaymentSuccessViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState("결제 승인 중...");
  const [done, setDone] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const orderId = searchParams.get("orderId");
  const effectiveKakaoUrl = kakaoChannelUrl ?? BUSINESS_INFO.kakaoChannelUrl;

  useEffect(() => {
    const paymentKey = searchParams.get("paymentKey");
    const amount = searchParams.get("amount");

    if (!paymentKey || !orderId || !amount) {
      setStatus("잘못된 접근입니다.");
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;

    const savedEmail =
      localStorage.getItem(`orderEmail:${orderId}`) ||
      localStorage.getItem("lastCustomerEmail") ||
      undefined;

    let checkoutMeta: Record<string, unknown> = {};
    const rawMeta = localStorage.getItem(`paymentCheckoutMeta:${orderId}`);
    if (rawMeta) {
      try {
        const parsed = JSON.parse(rawMeta);
        if (parsed && typeof parsed === "object") {
          checkoutMeta = parsed as Record<string, unknown>;
        }
      } catch {
        // ignore invalid localStorage metadata
      }
    }

    const confirmPayment = async () => {
      try {
        const response = await fetch(confirmApiPath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...checkoutMeta,
            paymentKey,
            orderId,
            amount,
            ...(savedEmail ? { email: savedEmail } : {}),
          }),
        });

        if (response.ok) {
          localStorage.removeItem(`paymentCheckoutMeta:${orderId}`);
          const data = await response.json().catch(() => null);
          const url = data?.payment?.receipt?.url;
          if (typeof url === "string" && url.startsWith("https://")) {
            setReceiptUrl(url);
          }
          setDone(true);
          setStatus(doneMessage);
          timer = setTimeout(() => {
            router.replace(`${redirectPath}?orderId=${orderId}`);
          }, REDIRECT_DELAY_MS);
        } else {
          const errorData = await response.json().catch(() => null);
          setStatus(`결제 승인 실패: ${errorData?.message || "알 수 없는 오류"}`);
        }
      } catch (error) {
        console.error(error);
        setStatus("결제 승인 요청 중 네트워크 오류가 발생했습니다.");
      }
    };

    confirmPayment();

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [searchParams, router, confirmApiPath, redirectPath, doneMessage, orderId]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-10">
      <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">{heading}</h1>
        <p className="text-gray-600">{status}</p>

        {done && (
          <div className="mt-6 text-left text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2.5">
            <p className="font-bold text-gray-900">영수증 · 현금영수증 확인 안내</p>
            {orderId && (
              <p>
                주문번호: <span className="font-mono">{orderId}</span>
              </p>
            )}
            {receiptUrl ? (
              <p>
                <a
                  href={receiptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline font-semibold"
                >
                  토스페이먼츠 영수증(매출전표) 확인하기
                </a>
              </p>
            ) : (
              <p>토스페이먼츠 영수증 링크를 불러오지 못했습니다. 아래 문의처로 주문번호와 함께 연락 주세요.</p>
            )}
            <p className="text-xs text-blue-800 bg-blue-50 border border-blue-100 rounded-lg p-2.5 leading-relaxed">
              생성 화면에서 AI 작성이 완료되면 <strong>{RESULT_TTL_DAYS}일간 열람 가능한 결과 링크</strong>와 <strong>.txt 다운로드</strong>가 제공되며, 입력하신 이메일로도 발송됩니다.
            </p>
            <p className="text-xs text-gray-500 leading-relaxed">
              현금영수증은 계좌이체·가상계좌 결제 시 발급을 신청하신 경우 위 영수증 화면에서 확인하실 수 있으며, 국세청 현금영수증 홈페이지(hometax.go.kr)에서도 조회할 수 있습니다. 확인이 어려운 경우 {BUSINESS_INFO.email} 로 문의해 주세요.
            </p>
            {effectiveKakaoUrl && (
              <p className="text-xs pt-0.5">
                <a
                  href={effectiveKakaoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 underline font-semibold"
                >
                  카카오톡 채널 1:1 문의하기 ↗
                </a>
              </p>
            )}
            <button
              type="button"
              onClick={() => router.replace(`${redirectPath}?orderId=${orderId}`)}
              className="mt-2 w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-sm cursor-pointer"
            >
              지금 생성 화면으로 이동
            </button>
            <p className="text-[11px] text-gray-400 text-center">
              {REDIRECT_DELAY_MS / 1000}초 후 자동으로 이동합니다.
            </p>
          </div>
        )}

        {!done && effectiveKakaoUrl && (
          <p className="mt-6 text-xs text-gray-500">
            결제 확인이 지연되나요?{" "}
            <a
              href={effectiveKakaoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline font-semibold"
            >
              카카오톡 채널 문의하기 ↗
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
