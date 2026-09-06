"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { loadPaymentWidget, PaymentWidgetInstance } from "@tosspayments/payment-widget-sdk";
import PreviewCard from "@/components/PreviewCard";
import PaymentSection from "@/components/PaymentSection";
import FAQAccordion from "@/components/FAQAccordion";

const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY || "test_gck_EXAMPLETEST";
const customerKey = "GUEST"; // 비회원 결제

/** 서비스 결제 금액 (원). 마케팅 문구와 결제 위젯이 이 값을 공유하여 불일치를 방지합니다. */
const PRICE = 4900;
const PRICE_DISPLAY = PRICE.toLocaleString("ko-KR"); // "4,900"

export default function Home() {
  const [resumePrompt, setResumePrompt] = useState("");
  const [selectedJobTitle, setSelectedJobTitle] = useState("");
  const [agreedToRefundPolicy, setAgreedToRefundPolicy] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [isWidgetReady, setIsWidgetReady] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  
  // 결제 버튼 처리 상태: 'idle' | 'processing' | 'timeout' | 'error'
  const [paymentState, setPaymentState] = useState<"idle" | "processing" | "timeout" | "error">("idle");
  const [paymentTimeoutMsg, setPaymentTimeoutMsg] = useState("");

  const paymentWidgetRef = useRef<PaymentWidgetInstance | null>(null);
  const paymentMethodsWidgetRef = useRef<any>(null);
  const timeoutTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isWidgetReadyRef = useRef(false);

  // 동기화 ref
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
        "#payment-widget",
        { value: PRICE },
        { variantKey: "DEFAULT" }
      );
      paymentWidget.renderAgreement("#agreement", { variantKey: "AGREEMENT" });
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
    const savedDraft = localStorage.getItem("resumeDraft");
    if (savedDraft) {
      setResumePrompt(savedDraft);
    }

    // 채용공고 등에서 공고명(jobTitle) 파라미터가 전달된 경우 타겟팅 배지 활성화 (textarea 본문은 오염시키지 않음)
    const urlParams = new URLSearchParams(window.location.search);
    const jobTitleParam = urlParams.get("jobTitle") || urlParams.get("job");
    if (jobTitleParam) {
      setSelectedJobTitle(jobTitleParam.trim());
      setTimeout(() => {
        const el = document.getElementById("resume-form");
        if (el) el.scrollIntoView({ behavior: "smooth" });
      }, 300);
    }

    // 자동 생성 체크 (결제 성공 후 리다이렉트 시)
    const successOrderId = urlParams.get("orderId");
    if (successOrderId && savedDraft) {
      window.history.replaceState({}, document.title, "/");
      handleGenerate(successOrderId, savedDraft);
    }

    initPaymentWidget();

    return () => {
      if (timeoutTimerRef.current) {
        clearTimeout(timeoutTimerRef.current);
      }
    };
  }, []);

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setResumePrompt(e.target.value);
    localStorage.setItem("resumeDraft", e.target.value);
    if (error) setError("");
  };

  const scrollToForm = () => {
    const el = document.getElementById("resume-form");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
      const textarea = document.getElementById("resume-textarea");
      if (textarea) textarea.focus();
    }
  };

  // 실제 결제창 요청 실행 함수
  const executePaymentRequest = async () => {
    const paymentWidget = paymentWidgetRef.current;
    if (!paymentWidget) {
      setPaymentState("error");
      setError("결제 위젯이 준비되지 않았습니다. 다시 시도해 주세요.");
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
      setPaymentState("idle");
      // 사용자 창 닫기 등 취소는 일반 에러 표시
      if (err.code !== "USER_CANCEL") {
        setError(err.message || "결제 요청 중 오류가 발생했습니다.");
      }
    }
  };

  // 결제 버튼 클릭 핸들러 (10초 타임아웃 및 무한 스피너 방지 Fail-Safe 탑재)
  const handlePaymentClick = async () => {
    setError("");
    setPaymentTimeoutMsg("");

    // 1. 사전 유효성 검증
    if (!resumePrompt.trim()) {
      setError("자기소개서 작성 내용을 먼저 입력해 주세요.");
      scrollToForm();
      return;
    }

    if (!agreedToRefundPolicy) {
      setError("결제 진행을 위해 환불 불가 정책에 동의해 주세요.");
      const checkbox = document.getElementById("refund-agree");
      if (checkbox) checkbox.focus();
      return;
    }

    // 2. 이미 SDK 위젯이 준비된 경우 -> 즉시 결제 실행
    if (isWidgetReady && paymentWidgetRef.current) {
      setPaymentState("idle");
      await executePaymentRequest();
      return;
    }

    // 3. 위젯이 아직 준비되지 않은 경우 -> 스피너 가동 및 10초 타임아웃 안전장치 시작
    setPaymentState("processing");

    // 이전 타이머 정리
    if (timeoutTimerRef.current) {
      clearTimeout(timeoutTimerRef.current);
    }

    // 폴링 인터벌로 준비 완료 감지 (최대 10초)
    const startTime = Date.now();
    const checkInterval = setInterval(() => {
      if (isWidgetReadyRef.current && paymentWidgetRef.current) {
        clearInterval(checkInterval);
        if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
        setPaymentState("idle");
        executePaymentRequest();
      }
    }, 200);

    // 10초 타임아웃 타이머
    timeoutTimerRef.current = setTimeout(() => {
      clearInterval(checkInterval);
      // 아직도 준비되지 않은 경우 스피너 중단 & 타임아웃 상태 전환
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

  const handleGenerate = async (paidOrderId?: string, promptText?: string) => {
    const textToUse = (promptText || resumePrompt).trim();
    if (!textToUse) {
      setError("자기소개서 작성 내용을 입력해 주세요.");
      scrollToForm();
      return;
    }

    setIsGenerating(true);
    setError("");
    setResult("");

    try {
      const payload: any = { 
        jobTitle: selectedJobTitle.trim() ? selectedJobTitle.trim() : "일반 직무",
        memo: textToUse,
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
          throw new Error("무료 생성 횟수(일 2회)가 초과되었습니다.");
        }
        if (res.status === 403) {
          throw new Error("결제 정보가 유효하지 않거나 사용 횟수를 모두 소진했습니다.");
        }
        throw new Error("생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      }

      const data = await res.json();
      setResult(data.text);
      // 결과 영역으로 부드럽게 스크롤
      setTimeout(() => {
        document.getElementById("result-section")?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } catch (err: any) {
      setError(err.message || "오류가 발생했습니다.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleInterviewRedirect = async () => {
    if (!result) return;
    setIsRedirecting(true);
    try {
      const res = await fetch("/api/interview/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText: result })
      });
      if (res.ok) {
        const data = await res.json();
        window.location.href = `/interview?token=${data.token}`;
      } else {
        alert("면접 준비 페이지로 이동하는 데 실패했습니다.");
      }
    } catch (err) {
      console.error(err);
      alert("오류가 발생했습니다.");
    } finally {
      setIsRedirecting(false);
    }
  };

  return (
    <main className="flex-1 bg-gray-50 text-gray-900">
      <div className="max-w-6xl w-full mx-auto px-3.5 sm:px-6 lg:px-8 py-6 sm:py-12 flex flex-col gap-8 sm:gap-10">
        
        {/* ========================================================================= */}
        {/* [과업 1: 메인 2단 전환 최적화 히어로 영역] */}
        {/* 데스크톱 md 이상: 2단 그리드 (좌: 가치제안/가격/CTA/신뢰, 우: Before/After) */}
        {/* 모바일: 1단 스택 (flex-col) 및 break-keep */}
        {/* ========================================================================= */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12 items-start">
          {/* 좌측 영역: 가치 제안 및 구매 전환 */}
          <div className="flex flex-col text-left break-keep">
            {/* 상단 알약 배지 */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200 self-start mb-4">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>공공기관 채용공고 30건 연동</span>
            </div>

            {/* 헤드라인 */}
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 tracking-tight leading-[1.2] mb-3">
              막막한 한 줄을<br />
              <span className="text-blue-600">합격하는 자소서</span>로
            </h1>

            {/* 서브카피 */}
            <p className="text-base sm:text-lg text-gray-600 mb-6 leading-relaxed">
              메모만 적어주세요. STAR 기법으로 3분 안에 완성됩니다.
            </p>

            {/* 가격 앵커링 박스 */}
            <div className="bg-white border border-blue-100 rounded-2xl p-5 shadow-sm mb-6 flex flex-col gap-2.5">
              <div className="flex flex-wrap items-baseline gap-2.5">
                <span className="text-sm sm:text-base text-gray-400 line-through">
                  시중 컨설팅 50,000원~
                </span>
                <span className="text-3xl sm:text-4xl font-extrabold text-blue-600 tracking-tight">
                  {PRICE_DISPLAY}원
                </span>
                <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                  단건 결제
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 self-start">
                <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                <span>1회 결제 · 3회 재생성 포함</span>
              </div>
            </div>

            {/* 메인 CTA 버튼 (상시 활성화 파란색) */}
            <div className="flex flex-col gap-2.5">
              <button
                onClick={scrollToForm}
                className="w-full py-4 px-6 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-base sm:text-lg rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>지금 자소서 만들기</span>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>

              {/* 서브 액션 텍스트 링크 */}
              <button
                onClick={scrollToForm}
                className="text-xs sm:text-sm text-gray-500 hover:text-blue-600 underline font-medium text-center py-1 transition-colors cursor-pointer"
              >
                먼저 무료로 1회 체험하기
              </button>
            </div>

            {/* 신뢰 뱃지 3종 (결제 근처 승격) */}
            <div className="mt-6 sm:mt-8 pt-6 border-t border-gray-200/80 flex flex-row gap-2 text-center w-full">
              <div className="flex-1 flex flex-col items-center justify-center gap-1 py-2 px-1 bg-white rounded-xl border border-gray-100 shadow-xs">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span className="font-bold text-gray-900 text-[11px] sm:text-xs">토스페이먼츠</span>
                <span className="text-[9.5px] sm:text-[11px] text-gray-500">안전결제</span>
              </div>

              <div className="flex-1 flex flex-col items-center justify-center gap-1 py-2 px-1 bg-white rounded-xl border border-gray-100 shadow-xs">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <span className="font-bold text-gray-900 text-[11px] sm:text-xs">사업자등록</span>
                <span className="text-[9.5px] sm:text-[11px] text-gray-500">476-12-03191</span>
              </div>

              <div className="flex-1 flex flex-col items-center justify-center gap-1 py-2 px-1 bg-white rounded-xl border border-gray-100 shadow-xs">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span className="font-bold text-gray-900 text-[11px] sm:text-xs">서버 미저장</span>
                <span className="text-[9.5px] sm:text-[11px] text-gray-500">즉시 파기</span>
              </div>
            </div>
          </div>

          {/* 우측 영역: Before / After 증거 시각화 */}
          <div className="w-full">
            <PreviewCard />
          </div>
        </section>

        {/* ========================================================================= */}
        {/* [자소서 입력 폼 섹션] */}
        {/* ========================================================================= */}
        <section id="resume-form" className="scroll-mt-20 bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <label htmlFor="resume-textarea" className="block text-base font-bold text-gray-900">
              자기소개서 작성 내용 <span className="text-blue-600">*</span>
            </label>
            <span className="text-xs text-gray-400 font-medium">
              {resumePrompt.length} / 1000자
            </span>
          </div>
          <p className="text-xs text-gray-500 mb-3 break-keep">
            완벽한 문장이 아니어도 괜찮습니다. 생각나는 단어나 활동 메모만 편하게 적어주시면 AI가 STAR(상황·과제·행동·결과) 기법으로 완성합니다.
          </p>

          {/* 선택된 공고 타겟팅 배지 (URL 파라미터 유입 시 노출, textarea 오염 방지) */}
          {selectedJobTitle && (
            <div className="mb-3.5 flex items-center justify-between gap-2 p-2.5 sm:px-3.5 sm:py-2 bg-sky-50 border border-sky-200 rounded-xl text-xs text-sky-900">
              <div className="flex items-center gap-2 min-w-0">
                <span className="shrink-0 font-bold bg-sky-200/80 text-sky-800 px-2 py-0.5 rounded-md text-[11px]">
                  타겟 공고
                </span>
                <span className="font-semibold truncate">
                  선택된 공고: {selectedJobTitle}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedJobTitle("")}
                className="shrink-0 text-sky-600 hover:text-sky-900 hover:bg-sky-100 px-2 py-0.5 rounded-lg transition-colors font-bold text-xs flex items-center gap-1 cursor-pointer"
                title="공고 선택 해제"
                aria-label="공고 선택 해제"
              >
                ✕ 해제
              </button>
            </div>
          )}

          <textarea
            id="resume-textarea"
            className="w-full h-44 p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition resize-none text-sm leading-relaxed"
            placeholder="예: 마케팅 인턴으로 근무하며 SNS 콘텐츠 기획을 담당함. 초기에 클릭률이 낮아서 A/B 테스트를 도입하고 타겟 고객을 분석했음. 그 결과 조회수가 2배 늘고 이벤트 참여율이 30% 상승함."
            maxLength={1000}
            value={resumePrompt}
            onChange={handlePromptChange}
          ></textarea>
        </section>

        {/* ========================================================================= */}
        {/* [결제 및 생성 섹션 (공통 컴포넌트)] */}
        {/* ========================================================================= */}
        <PaymentSection
          priceDisplay={PRICE_DISPLAY}
          agreedToRefundPolicy={agreedToRefundPolicy}
          onAgreedChange={setAgreedToRefundPolicy}
          refundCheckboxId="refund-agree"
          guaranteeBenefitText="STAR 기반 3회 생성/재생성 포함"
          error={error}
          paymentState={paymentState}
          paymentTimeoutMsg={paymentTimeoutMsg}
          onRetryPayment={handleRetryPayment}
          onPaymentClick={handlePaymentClick}
          paidButtonText={`${PRICE_DISPLAY}원 결제하고 완성하기`}
          paidButtonSubText="3회 포함"
          isGenerating={isGenerating}
          onFreeGenerate={() => handleGenerate()}
          freeButtonText="먼저 무료로 생성하기 (일 2회 제한)"
          generatingText="AI 자소서 생성 중..."
        />

        {/* ========================================================================= */}
        {/* [생성된 자소서 결과 섹션] */}
        {/* ========================================================================= */}
        {result && (
          <section id="result-section" className="scroll-mt-20 bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-200 animate-fadeIn">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                생성된 자기소개서 초안
              </h2>
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                STAR 교정 완료
              </span>
            </div>
            
            <div className="whitespace-pre-wrap bg-gray-50/80 p-5 rounded-xl border border-gray-200 text-sm leading-relaxed mb-6 font-normal text-gray-800 select-text">
              {result}
            </div>

            <button
              onClick={handleInterviewRedirect}
              disabled={isRedirecting}
              className="w-full py-4 px-6 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-emerald-400 text-white font-bold text-base rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {isRedirecting ? (
                <span>면접 준비 페이지로 이동 중...</span>
              ) : (
                <>
                  <span>이 자소서로 AI 면접 꼬리질문 받아보기</span>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </>
              )}
            </button>
          </section>
        )}

        {/* ========================================================================= */}
        {/* [FAQ 섹션] */}
        {/* ========================================================================= */}
        <FAQAccordion />

      </div>
    </main>
  );
}

