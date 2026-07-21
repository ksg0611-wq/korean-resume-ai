"use client";

import { useState, useEffect, useRef } from "react";
import { loadPaymentWidget, PaymentWidgetInstance } from "@tosspayments/payment-widget-sdk";

const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY || "test_gck_EXAMPLETEST";
const customerKey = "GUEST"; // 비회원 결제

export default function Home() {
  const [resumePrompt, setResumePrompt] = useState("");
  const [agreedToRefundPolicy, setAgreedToRefundPolicy] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [isWidgetReady, setIsWidgetReady] = useState(false);
  
  const paymentWidgetRef = useRef<PaymentWidgetInstance | null>(null);
  const paymentMethodsWidgetRef = useRef<any>(null);

  useEffect(() => {
    const savedDraft = localStorage.getItem("resumeDraft");
    if (savedDraft) {
      setResumePrompt(savedDraft);
    }

    // 자동 생성 체크 (결제 성공 후 리다이렉트 시)
    const urlParams = new URLSearchParams(window.location.search);
    const successOrderId = urlParams.get("orderId");
    if (successOrderId && savedDraft) {
      // URL 파라미터 지우기
      window.history.replaceState({}, document.title, "/");
      handleGenerate(successOrderId, savedDraft);
    }

    // 결제 위젯 초기화
    (async () => {
      try {
        console.log("Toss Client Key:", clientKey);
        const paymentWidget = await loadPaymentWidget(clientKey, customerKey);
        paymentWidgetRef.current = paymentWidget;
        
        const paymentMethodsWidget = paymentWidget.renderPaymentMethods(
          "#payment-widget",
          { value: 4900 },
          { variantKey: "DEFAULT" }
        );
        paymentWidget.renderAgreement("#agreement", { variantKey: "AGREEMENT" });
        paymentMethodsWidget.on("ready", () => {
          setIsWidgetReady(true);
        });
        paymentMethodsWidgetRef.current = paymentMethodsWidget;
      } catch (err) {
        console.error("결제 위젯 초기화 실패:", err);
        setError("결제 모듈을 불러오지 못했습니다. Client Key를 확인해주세요.");
      }
    })();
  }, []);

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setResumePrompt(e.target.value);
    localStorage.setItem("resumeDraft", e.target.value);
  };

  const requestPayment = async () => {
    if (!agreedToRefundPolicy || !isWidgetReady) return;
    
    const paymentWidget = paymentWidgetRef.current;
    if (!paymentWidget) {
      setError("결제 위젯이 로드되지 않았습니다.");
      return;
    }

    try {
      const orderId = "order_" + Math.random().toString(36).substring(2, 11);
      await paymentWidget.requestPayment({
        orderId,
        orderName: "자기소개서 AI 생성 (3회권)",
        successUrl: window.location.origin + "/payments/success",
        failUrl: window.location.origin + "/payments/fail",
      });
    } catch (err: any) {
      setError(err.message || "결제 요청 중 오류가 발생했습니다.");
    }
  };

  const handleGenerate = async (paidOrderId?: string, promptText?: string) => {
    setIsGenerating(true);
    setError("");
    setResult("");

    try {
      const payload: any = { 
        jobTitle: "일반 직무", // 임시 직무
        memo: promptText || resumePrompt,
        isFree: !paidOrderId,
      };
      
      if (paidOrderId) {
        payload.orderId = paidOrderId;
      }

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        if (res.status === 429) {
          throw new Error("무료 생성 횟수가 초과되었습니다.");
        }
        if (res.status === 403) {
          throw new Error("결제 정보가 유효하지 않습니다.");
        }
        throw new Error("생성 중 오류가 발생했습니다.");
      }

      const data = await res.json();
      setResult(data.text);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center p-8 sm:p-24 bg-gray-50 text-gray-900">
      <div className="max-w-2xl w-full flex flex-col gap-8">
        <header className="text-center">
          <h1 className="text-4xl font-bold mb-4">Korean Resume AI Tool</h1>
          <p className="text-lg text-gray-600">
            STAR 프레임워크와 직무별 키워드 매핑 로직을 적용해 완벽한 자소서 초안을 만듭니다.
          </p>
        </header>

        <section className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            자기소개서 작성 내용 (상황, 과제, 행동, 결과를 자유롭게 작성해주세요)
          </label>
          <textarea
            className="w-full h-48 p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
            placeholder="예: 마케팅 인턴으로 근무하며..."
            value={resumePrompt}
            onChange={handlePromptChange}
          ></textarea>
        </section>

        <section className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 flex flex-col gap-4">
          <h2 className="text-xl font-semibold">결제 및 생성 (4,900원)</h2>
          
          <div id="payment-widget" className="w-full"></div>
          <div id="agreement" className="w-full"></div>

          <label className="flex items-start gap-3 cursor-pointer p-3 bg-gray-50 border border-gray-200 rounded-md">
            <input
              type="checkbox"
              className="mt-1 w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              checked={agreedToRefundPolicy}
              onChange={(e) => setAgreedToRefundPolicy(e.target.checked)}
            />
            <span className="text-sm text-gray-700">
              결제 완료 시 즉시 AI 생성이 시작되는 디지털 콘텐츠 특성상, 생성 시작 후 단순 변심에 의한 환불이 불가함에 동의합니다.
            </span>
          </label>

          <button
            onClick={requestPayment}
            disabled={!agreedToRefundPolicy || !resumePrompt.trim() || !isWidgetReady}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium rounded-md shadow-sm transition"
          >
            {!isWidgetReady ? "결제 모듈 로딩 중..." : "결제하기"}
          </button>

          <button
            onClick={() => handleGenerate()}
            disabled={isGenerating || !resumePrompt.trim()}
            className="w-full py-3 px-4 bg-white border border-blue-600 text-blue-600 hover:bg-blue-50 disabled:border-gray-300 disabled:text-gray-400 disabled:bg-gray-50 disabled:cursor-not-allowed font-medium rounded-md shadow-sm transition mt-2"
          >
            {isGenerating ? "AI 자소서 생성 중..." : "무료로 생성하기 (일 3회 제한)"}
          </button>

          {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded-md text-sm border border-red-200">
              {error}
            </div>
          )}
        </section>

        {result && (
          <section className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h2 className="text-xl font-semibold mb-4">생성된 자기소개서</h2>
            <div className="whitespace-pre-wrap bg-gray-50 p-4 rounded-md border border-gray-100 text-sm leading-relaxed">
              {result}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

