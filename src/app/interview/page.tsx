"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { loadPaymentWidget, PaymentWidgetInstance } from "@tosspayments/payment-widget-sdk";

const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY || "test_gck_EXAMPLETEST";
const customerKey = "GUEST"; // 비회원 결제

function InterviewContent() {
  const [resumeText, setResumeText] = useState("");
  const [jobCategory, setJobCategory] = useState("IT");
  const [agreedToRefundPolicy, setAgreedToRefundPolicy] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [isWidgetReady, setIsWidgetReady] = useState(false);
  
  const paymentWidgetRef = useRef<PaymentWidgetInstance | null>(null);
  const paymentMethodsWidgetRef = useRef<any>(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get("token");
    const successOrderId = urlParams.get("orderId");

    const fetchDraft = async (t: string) => {
      try {
        const res = await fetch(`/api/interview/draft?token=${t}`);
        if (res.ok) {
          const data = await res.json();
          setResumeText(data.resumeText);
          localStorage.setItem("interviewResumeDraft", data.resumeText);
        } else {
          setError("자소서 원문을 불러오지 못했거나 토큰이 만료되었습니다.");
        }
      } catch (err) {
        setError("네트워크 오류로 자소서를 불러오지 못했습니다.");
      }
      // Remove token from URL
      urlParams.delete("token");
      window.history.replaceState({}, document.title, window.location.pathname + (urlParams.toString() ? `?${urlParams.toString()}` : ""));
    };

    if (token) {
      fetchDraft(token);
    } else {
      const savedDraft = localStorage.getItem("interviewResumeDraft");
      if (savedDraft) {
        setResumeText(savedDraft);
      }
    }

    if (successOrderId) {
      // 결제 성공 후 돌아온 경우
      const savedDraft = localStorage.getItem("interviewResumeDraft");
      if (savedDraft) {
        urlParams.delete("orderId");
        window.history.replaceState({}, document.title, window.location.pathname + (urlParams.toString() ? `?${urlParams.toString()}` : ""));
        handleGenerate(successOrderId, savedDraft);
      }
    }

    // 결제 위젯 초기화
    (async () => {
      try {
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

  const requestPayment = async () => {
    if (!agreedToRefundPolicy || !isWidgetReady) return;
    
    const paymentWidget = paymentWidgetRef.current;
    if (!paymentWidget) return;

    try {
      const orderId = "int_" + Math.random().toString(36).substring(2, 11);
      await paymentWidget.requestPayment({
        orderId,
        orderName: "STAR 기반 심화 질문 3회 생성 포함",
        successUrl: window.location.origin + "/interview/payments/success",
        failUrl: window.location.origin + "/payments/fail",
      });
    } catch (err: any) {
      setError(err.message || "결제 요청 중 오류가 발생했습니다.");
    }
  };

  const handleGenerate = async (paidOrderId?: string, text?: string) => {
    setIsGenerating(true);
    setError("");
    setResult("");

    try {
      const payload: any = { 
        jobCategory,
        resumeText: text || resumeText,
        isFree: !paidOrderId,
      };
      
      if (paidOrderId) {
        payload.orderId = paidOrderId;
      }

      const res = await fetch("/api/interview/generate", {
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
          <h1 className="text-4xl font-bold mb-4">AI 면접 꼬리질문 시뮬레이터</h1>
          <p className="text-lg text-gray-600">
            입력된 자소서를 기반으로 STAR 기법에 맞춘 3단계 심화 압박 질문을 생성합니다.
          </p>
        </header>

        <section className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h2 className="text-xl font-semibold mb-2">선택된 자소서 내용</h2>
          <div className="w-full h-48 p-3 border border-gray-300 rounded-md bg-gray-50 overflow-y-auto text-sm text-gray-700 whitespace-pre-wrap">
            {resumeText || "자소서 원문이 없습니다. 이전 페이지에서 다시 진행해주세요."}
          </div>
        </section>

        <section className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            지원 직무 카테고리 선택
          </label>
          <select
            value={jobCategory}
            onChange={(e) => setJobCategory(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-md outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="IT">IT (개발, 데이터 등)</option>
            <option value="기획">기획 (서비스 기획, 전략 등)</option>
            <option value="마케팅">마케팅 (퍼포먼스, 콘텐츠 등)</option>
            <option value="기타">기타 직무</option>
          </select>
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
              결제 완료 시 즉시 AI 생성이 시작되는 디지털 콘텐츠 특성상, 생성 시작 후 단순 변심에 의한 환불이 불가함에 동의합니다. (면접 꼬리질문 기능도 입력된 자소서 내용을 Google Gemini API로 전송하여 처리함)
            </span>
          </label>

          <button
            onClick={requestPayment}
            disabled={!agreedToRefundPolicy || !resumeText || !isWidgetReady}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium rounded-md shadow-sm transition"
          >
            {!isWidgetReady ? "결제 모듈 로딩 중..." : "결제하기 (STAR 기반 심화 질문 3회 생성 포함)"}
          </button>

          <button
            onClick={() => handleGenerate()}
            disabled={isGenerating || !resumeText}
            className="w-full py-3 px-4 bg-white border border-blue-600 text-blue-600 hover:bg-blue-50 disabled:border-gray-300 disabled:text-gray-400 disabled:bg-gray-50 disabled:cursor-not-allowed font-medium rounded-md shadow-sm transition mt-2"
          >
            {isGenerating ? "AI 면접 질문 생성 중..." : "무료로 생성하기 (일 1회 제한)"}
          </button>

          {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded-md text-sm border border-red-200">
              {error}
            </div>
          )}
        </section>

        {result && (
          <section className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h2 className="text-xl font-semibold mb-4">생성된 면접 꼬리질문</h2>
            <div className="whitespace-pre-wrap bg-gray-50 p-4 rounded-md border border-gray-100 text-sm leading-relaxed">
              {result}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

export default function InterviewPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <InterviewContent />
    </Suspense>
  );
}
