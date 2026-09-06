"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { loadPaymentWidget, PaymentWidgetInstance } from "@tosspayments/payment-widget-sdk";
import PaymentSection from "@/components/PaymentSection";
import InterviewPreviewCard from "@/components/InterviewPreviewCard";
import FAQAccordion from "@/components/FAQAccordion";

const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY || "test_gck_EXAMPLETEST";
const customerKey = "GUEST"; // 비회원 결제
const PRICE = 4900;
const PRICE_DISPLAY = PRICE.toLocaleString("ko-KR");

function InterviewContent() {
  const [resumeText, setResumeText] = useState("");
  const [jobCategory, setJobCategory] = useState("IT");
  const [agreedToRefundPolicy, setAgreedToRefundPolicy] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [isWidgetReady, setIsWidgetReady] = useState(false);

  // 결제 버튼 처리 상태: 'idle' | 'processing' | 'timeout' | 'error'
  const [paymentState, setPaymentState] = useState<"idle" | "processing" | "timeout" | "error">("idle");
  const [paymentTimeoutMsg, setPaymentTimeoutMsg] = useState("");

  const paymentWidgetRef = useRef<PaymentWidgetInstance | null>(null);
  const paymentMethodsWidgetRef = useRef<any>(null);
  const timeoutTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isWidgetReadyRef = useRef(false);

  useEffect(() => {
    isWidgetReadyRef.current = isWidgetReady;
  }, [isWidgetReady]);

  const initPaymentWidget = async () => {
    try {
      setError("");
      setPaymentTimeoutMsg("");
      const paymentWidget = await loadPaymentWidget(clientKey, customerKey);
      paymentWidgetRef.current = paymentWidget;

      const paymentMethodsWidget = paymentWidget.renderPaymentMethods(
        "#interview-payment-widget",
        { value: PRICE },
        { variantKey: "DEFAULT" }
      );
      paymentWidget.renderAgreement("#interview-agreement", { variantKey: "AGREEMENT" });
      paymentMethodsWidget.on("ready", () => {
        setIsWidgetReady(true);
        isWidgetReadyRef.current = true;
      });
      paymentMethodsWidgetRef.current = paymentMethodsWidget;
    } catch (err: any) {
      console.error("결제 위젯 초기화 실패:", err);
      setPaymentState("error");
      setError("결제 모듈을 불러오지 못했습니다. 네트워크를 확인 후 다시 시도해 주세요.");
    }
  };

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
          setError("자소서 원문을 불러오지 못했거나 토큰이 만료되었습니다. 직접 입력해 주세요.");
        }
      } catch (err) {
        setError("네트워크 오류로 자소서를 불러오지 못했습니다. 직접 입력해 주세요.");
      }
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
      const savedDraft = localStorage.getItem("interviewResumeDraft");
      if (savedDraft) {
        urlParams.delete("orderId");
        window.history.replaceState({}, document.title, window.location.pathname + (urlParams.toString() ? `?${urlParams.toString()}` : ""));
        handleGenerate(successOrderId, savedDraft);
      }
    }

    initPaymentWidget();

    return () => {
      if (timeoutTimerRef.current) {
        clearTimeout(timeoutTimerRef.current);
      }
    };
  }, []);

  const handleResumeTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setResumeText(e.target.value);
    localStorage.setItem("interviewResumeDraft", e.target.value);
    if (error) setError("");
  };

  const executePaymentRequest = async () => {
    const paymentWidget = paymentWidgetRef.current;
    if (!paymentWidget) {
      setPaymentState("error");
      setError("결제 위젯이 준비되지 않았습니다. 다시 시도해 주세요.");
      return;
    }

    try {
      const orderId = "int_" + Math.random().toString(36).substring(2, 11);
      await paymentWidget.requestPayment({
        orderId,
        orderName: "STAR 기반 심화 질문 3회 생성 포함",
        successUrl: window.location.origin + "/interview/payments/success",
        failUrl: window.location.origin + "/payments/fail",
      });
    } catch (err: any) {
      setPaymentState("idle");
      if (err.code !== "USER_CANCEL") {
        setError(err.message || "결제 요청 중 오류가 발생했습니다.");
      }
    }
  };

  const handlePaymentClick = async () => {
    setError("");
    setPaymentTimeoutMsg("");

    if (!resumeText.trim()) {
      setError("자기소개서 작성 내용을 먼저 입력해 주세요.");
      const el = document.getElementById("interview-textarea");
      if (el) el.focus();
      return;
    }

    if (!agreedToRefundPolicy) {
      setError("결제 진행을 위해 환불 불가 정책에 동의해 주세요.");
      const checkbox = document.getElementById("interview-refund-agree");
      if (checkbox) checkbox.focus();
      return;
    }

    if (isWidgetReady && paymentWidgetRef.current) {
      setPaymentState("processing");
      await executePaymentRequest();
      return;
    }

    setPaymentState("processing");

    const checkInterval = setInterval(async () => {
      if (isWidgetReadyRef.current && paymentWidgetRef.current) {
        clearInterval(checkInterval);
        if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
        await executePaymentRequest();
      }
    }, 200);

    timeoutTimerRef.current = setTimeout(() => {
      clearInterval(checkInterval);
      if (!isWidgetReadyRef.current) {
        setPaymentState("timeout");
        setPaymentTimeoutMsg(
          "결제 모듈 연결에 시간이 소요되고 있습니다. 네트워크 상태를 확인하시거나 아래 [결제 다시 시도] 버튼을 눌러주세요."
        );
      }
    }, 10000);
  };

  const handleRetryPayment = () => {
    setPaymentState("idle");
    setPaymentTimeoutMsg("");
    setError("");
    initPaymentWidget();
  };

  const handleGenerate = async (paidOrderId?: string, text?: string) => {
    const textToUse = (text || resumeText).trim();
    if (!textToUse) {
      setError("자기소개서 작성 내용을 입력해 주세요.");
      const el = document.getElementById("interview-textarea");
      if (el) el.focus();
      return;
    }

    setIsGenerating(true);
    setError("");
    setResult("");

    try {
      const payload: any = {
        jobCategory,
        resumeText: textToUse,
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
          throw new Error("무료 생성 횟수(일 1회)가 초과되었습니다.");
        }
        if (res.status === 403) {
          throw new Error("결제 정보가 유효하지 않거나 사용 횟수를 모두 소진했습니다.");
        }
        throw new Error("생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      }

      const data = await res.json();
      setResult(data.text);

      setTimeout(() => {
        document.getElementById("result-section")?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } catch (err: any) {
      setError(err.message || "오류가 발생했습니다.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <main className="flex-1 min-h-screen bg-gray-50 py-8 sm:py-12 px-4 sm:px-6 lg:px-8 text-gray-900">
      <div className="max-w-6xl mx-auto flex flex-col gap-10">
        {/* ========================================================================= */}
        {/* [2단 메인 히어로 섹션] */}
        {/* ========================================================================= */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10 items-start">
          {/* 좌측 영역: 가치제안 / 자소서 입력창 / 직무선택 / 결제 / 신뢰박스 */}
          <div className="flex flex-col gap-6">
            {/* 상단 알약 배지 */}
            <div className="inline-flex items-center gap-1.5 self-start px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-700">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              실전 면접관 압박 시뮬레이션
            </div>

            {/* 메인 헤드라인 & 서브카피 */}
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900 tracking-tight leading-tight">
                AI 면접 꼬리질문 시뮬레이터
              </h1>
              <p className="mt-3 text-sm sm:text-base text-gray-600 leading-relaxed break-keep">
                제출한 자소서를 바탕으로 실제 대기업·공공기관 면접관 관점에서 <strong className="text-gray-900">STAR 기법 3단계 심층 꼬리질문</strong>을 생성합니다. 예상치 못한 압박 질문을 사전에 방어하세요.
              </p>
            </div>

            {/* 자소서 본문 입력 섹션 (단독 진입로 확보) */}
            <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-gray-200 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label htmlFor="interview-textarea" className="block text-sm font-bold text-gray-900">
                  자기소개서 본문 입력 <span className="text-blue-600">*</span>
                </label>
                <span className="text-xs text-gray-400 font-medium">
                  {resumeText.length} / 2000자
                </span>
              </div>
              <p className="text-xs text-gray-500 break-keep">
                자소서 원문 또는 검증받고 싶은 프로젝트 경험을 자유롭게 붙여넣어 주세요.
              </p>
              <textarea
                id="interview-textarea"
                rows={6}
                value={resumeText}
                onChange={handleResumeTextChange}
                maxLength={2000}
                placeholder="예: 웹 결제 페이지 이탈률 30% 문제를 해결하기 위해 React 상태관리를 재설계하고 API 캐싱을 적용해 완료율을 18% 개선했습니다. (이전 페이지에서 자소서를 작성하셨다면 자동으로 불러와집니다.)"
                className="w-full p-3.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-sm text-gray-800 leading-relaxed resize-y min-h-[140px]"
              />

              {/* 지원 직무 선택 드롭다운 */}
              <div className="pt-2 border-t border-gray-100 flex flex-col gap-1.5">
                <label htmlFor="job-category-select" className="text-xs font-bold text-gray-700">
                  면접관 전문 분야 (직무 선택)
                </label>
                <select
                  id="job-category-select"
                  value={jobCategory}
                  onChange={(e) => setJobCategory(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm font-medium text-gray-800 cursor-pointer"
                >
                  <option value="IT">IT / 개발 (소프트웨어, 데이터, 인프라 등)</option>
                  <option value="기획">기획 / 전략 (서비스 기획, PM, 신사업 등)</option>
                  <option value="마케팅">마케팅 / 홍보 (퍼포먼스, 콘텐츠, 브랜드 등)</option>
                  <option value="기타">기타 직무 (경영지원, 공공, 영업 등)</option>
                </select>
              </div>
            </div>

            {/* 결제 컴포넌트 (공통 컴포넌트 탑재) */}
            <PaymentSection
              priceDisplay={PRICE_DISPLAY}
              title={`결제 및 생성 (${PRICE_DISPLAY}원)`}
              subTitle="토스페이먼츠 보안 모듈을 통해 안전하게 결제됩니다."
              badgeText="단건 결제"
              agreedToRefundPolicy={agreedToRefundPolicy}
              onAgreedChange={setAgreedToRefundPolicy}
              refundCheckboxId="interview-refund-agree"
              guaranteeBenefitText="STAR 기반 심화 질문 3회 생성 포함"
              error={error}
              paymentState={paymentState}
              paymentTimeoutMsg={paymentTimeoutMsg}
              onRetryPayment={handleRetryPayment}
              onPaymentClick={handlePaymentClick}
              paidButtonText={`${PRICE_DISPLAY}원 결제하고 심화 질문 생성하기`}
              paidButtonSubText="3회 포함"
              processingText="결제창을 준비하고 있습니다..."
              isGenerating={isGenerating}
              onFreeGenerate={() => handleGenerate()}
              freeButtonText="먼저 무료로 생성하기 (일 1회 제한)"
              generatingText="AI 면접 질문 생성 중..."
              widgetContainerId="interview-payment-widget"
              agreementContainerId="interview-agreement"
            />

            {/* 신뢰 뱃지 3종 */}
            <div className="flex gap-2 sm:gap-3">
              <div className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 px-2 bg-white rounded-xl border border-gray-100 shadow-xs text-center">
                <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span className="font-bold text-gray-900 text-xs">토스 안심결제</span>
                <span className="text-[10px] text-gray-500">100% 암호화</span>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 px-2 bg-white rounded-xl border border-gray-100 shadow-xs text-center">
                <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <span className="font-bold text-gray-900 text-xs">사업자등록</span>
                <span className="text-[10px] text-gray-500">476-12-03191</span>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 px-2 bg-white rounded-xl border border-gray-100 shadow-xs text-center">
                <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span className="font-bold text-gray-900 text-xs">서버 미저장</span>
                <span className="text-[10px] text-gray-500">즉시 파기</span>
              </div>
            </div>
          </div>

          {/* 우측 영역: 3단계 압박 꼬리질문 프리뷰 카드 */}
          <div className="w-full">
            <InterviewPreviewCard />
          </div>
        </section>

        {/* ========================================================================= */}
        {/* [생성된 면접 질문 결과 섹션] */}
        {/* ========================================================================= */}
        {result && (
          <section id="result-section" className="scroll-mt-20 bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-200 animate-fadeIn">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                생성된 면접 꼬리질문 리포트
              </h2>
              <span className="text-xs font-semibold px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg">
                STAR 심층 검증 완료
              </span>
            </div>
            <div className="whitespace-pre-wrap bg-gray-50 p-5 sm:p-6 rounded-xl border border-gray-100 text-sm sm:text-base text-gray-800 leading-relaxed font-normal">
              {result}
            </div>
          </section>
        )}

        {/* ========================================================================= */}
        {/* [FAQ 아코디언] */}
        {/* ========================================================================= */}
        <FAQAccordion />
      </div>
    </main>
  );
}

export default function InterviewPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-gray-500">로딩 중...</div>}>
      <InterviewContent />
    </Suspense>
  );
}
