"use client";

import React from "react";

export interface PaymentSectionProps {
  priceDisplay?: string;
  title?: string;
  subTitle?: string;
  badgeText?: string;
  agreedToRefundPolicy: boolean;
  onAgreedChange: (agreed: boolean) => void;
  refundCheckboxId?: string;
  guaranteeBenefitText?: string;
  error?: string;
  paymentState: "idle" | "processing" | "timeout" | "error";
  paymentTimeoutMsg?: string;
  onRetryPayment: () => void;
  onPaymentClick: () => void;
  paidButtonText?: string;
  paidButtonSubText?: string;
  processingText?: string;
  isGenerating: boolean;
  onFreeGenerate: () => void;
  freeButtonText?: string;
  generatingText?: string;
  widgetContainerId?: string;
  agreementContainerId?: string;
}

export default function PaymentSection({
  priceDisplay = "4,900",
  title,
  subTitle = "토스페이먼츠 보안 모듈을 통해 안전하게 결제됩니다.",
  badgeText = "단건 결제",
  agreedToRefundPolicy,
  onAgreedChange,
  refundCheckboxId = "refund-agree",
  guaranteeBenefitText = "STAR 기반 3회 생성/재생성 포함",
  error,
  paymentState,
  paymentTimeoutMsg,
  onRetryPayment,
  onPaymentClick,
  paidButtonText,
  paidButtonSubText = "3회 포함",
  processingText = "결제창을 준비하고 있습니다...",
  isGenerating,
  onFreeGenerate,
  freeButtonText = "먼저 무료로 생성하기 (일 2회 제한)",
  generatingText = "AI 생성 중...",
  widgetContainerId = "payment-widget",
  agreementContainerId = "agreement",
}: PaymentSectionProps) {
  const displayTitle = title || `결제 및 생성 (${priceDisplay}원)`;
  const displayPaidText = paidButtonText || `${priceDisplay}원 결제하고 완성하기`;

  // ── 생성 대기 단계별 진행 상태 관리 (무한 대기 방지 및 체감 속도 개선) ──
  const [generationStep, setGenerationStep] = React.useState(0);
  const [progressPercent, setProgressPercent] = React.useState(15);

  React.useEffect(() => {
    if (!isGenerating) {
      setGenerationStep(0);
      setProgressPercent(15);
      return;
    }

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsedSec = (Date.now() - startTime) / 1000;
      if (elapsedSec < 3.5) {
        setGenerationStep(1);
        setProgressPercent(Math.min(40, Math.floor(15 + elapsedSec * 7)));
      } else if (elapsedSec < 8.5) {
        setGenerationStep(2);
        setProgressPercent(Math.min(75, Math.floor(40 + (elapsedSec - 3.5) * 7)));
      } else if (elapsedSec < 13.5) {
        setGenerationStep(3);
        setProgressPercent(Math.min(92, Math.floor(75 + (elapsedSec - 8.5) * 3.4)));
      } else {
        setGenerationStep(4);
        setProgressPercent(96);
      }
    }, 200);

    return () => clearInterval(interval);
  }, [isGenerating]);

  const getStepText = () => {
    switch (generationStep) {
      case 1:
        return "1단계: 입력 경험 및 직무 맥락 분석 중...";
      case 2:
        return "2단계: STAR 구조 심층 분석 및 문장 재구성 중... (약 10~15초 소요)";
      case 3:
        return "3단계: 비즈니스 임팩트 수치화 및 논리 검증 중...";
      case 4:
        return "4단계: 최종 리포트 서식 정리 중 (잠시만 기다려주세요)...";
      default:
        return "AI 심층 생성 준비 중...";
    }
  };

  return (
    <section className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-200 flex flex-col gap-5">
      {/* 결제 헤더 */}
      <div className="flex items-center justify-between border-b border-gray-100 pb-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-gray-900">
            {displayTitle}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {subTitle}
          </p>
        </div>
        <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100">
          {badgeText}
        </span>
      </div>

      {/* Toss Payments 위젯 컨테이너 */}
      <div id={widgetContainerId} className="w-full"></div>
      <div id={agreementContainerId} className="w-full"></div>

      {/* 환불 정책 동의 체크박스 */}
      <label
        htmlFor={refundCheckboxId}
        className="flex items-start gap-3 cursor-pointer p-4 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100/70 transition-colors"
      >
        <input
          id={refundCheckboxId}
          type="checkbox"
          className="mt-0.5 w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 flex-shrink-0 cursor-pointer"
          checked={agreedToRefundPolicy}
          onChange={(e) => onAgreedChange(e.target.checked)}
        />
        <span className="text-xs sm:text-sm text-gray-700 leading-relaxed break-keep">
          <strong>[필수]</strong> 결제 완료 시 즉시 AI 생성이 시작되는 디지털 콘텐츠 특성상, 생성 시작 후 단순 변심에 의한 환불이 불가함에 동의합니다. (시스템 오류 시 100% 전액 환불)
        </span>
      </label>

      {/* 안전 결제 보장 바 */}
      <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-6 text-xs sm:text-sm font-semibold text-emerald-700 bg-emerald-50 py-3 px-4 rounded-xl border border-emerald-100 text-center">
        <span className="flex items-center justify-center gap-1.5">
          <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          구독 자동 결제 없음 (1회 단건 결제)
        </span>
        <span className="hidden sm:inline text-emerald-300">|</span>
        <span className="flex items-center justify-center gap-1.5">
          <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          {guaranteeBenefitText}
        </span>
      </div>

      {/* 에러 메시지 (타임아웃 시에는 중복 노출 방지를 위해 주황색 타임아웃 박스만 단독 표출) */}
      {error && paymentState !== "timeout" && (
        <div className="p-3.5 bg-red-50 text-red-700 rounded-xl text-xs sm:text-sm border border-red-200 flex items-start gap-2">
          <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* 타임아웃 안내 및 재시도 버튼 */}
      {paymentState === "timeout" && (
        <div className="p-4 bg-amber-50 text-amber-800 rounded-xl text-xs sm:text-sm border border-amber-200 flex flex-col gap-3">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{paymentTimeoutMsg}</span>
          </div>
          <button
            type="button"
            onClick={onRetryPayment}
            className="self-start py-2 px-4 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
          >
            결제 다시 시도 ↻
          </button>
        </div>
      )}

      {/* 생성 대기 진행 상태 안내 (무한 대기 방지 단계별 진행 문구 및 프로그레스 바) */}
      {isGenerating && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl flex flex-col gap-2.5 animate-fadeIn">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4 text-blue-600 shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span className="text-xs sm:text-sm font-bold text-blue-900">
                {getStepText()}
              </span>
            </div>
            <span className="text-[11px] font-semibold text-blue-700 bg-blue-100/80 px-2.5 py-0.5 rounded-full shrink-0">
              약 10~15초 소요
            </span>
          </div>
          <div className="w-full bg-blue-200/60 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-blue-600 h-1.5 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-[11px] text-blue-700 leading-relaxed">
            Gemini 3.8 Flash가 실무진 면접관·채용담당자 관점에서 논리 구조와 비즈니스 수치를 정밀 교정하고 있습니다.
          </p>
        </div>
      )}

      {/* [상시 파란색 활성 결제 버튼] (회색 비활성 제거, 10초 타임아웃 상태 머신) */}
      <button
        type="button"
        onClick={onPaymentClick}
        disabled={paymentState === "processing" || isGenerating}
        className="w-full py-4 px-6 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-blue-500 text-white font-bold text-base sm:text-lg rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:cursor-wait"
      >
        {paymentState === "processing" ? (
          <>
            <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>{processingText}</span>
          </>
        ) : (
          <>
            <span>{displayPaidText}</span>
            {paidButtonSubText && (
              <span className="text-xs bg-blue-500/80 px-2 py-0.5 rounded font-normal">
                {paidButtonSubText}
              </span>
            )}
          </>
        )}
      </button>

      {/* 무료 생성 버튼 */}
      <button
        type="button"
        onClick={onFreeGenerate}
        disabled={isGenerating}
        className="w-full py-3.5 px-4 bg-white border border-blue-600 text-blue-600 hover:bg-blue-50 disabled:border-gray-300 disabled:text-gray-400 disabled:bg-gray-50 disabled:cursor-not-allowed font-semibold text-sm rounded-xl shadow-xs transition-all cursor-pointer"
      >
        {isGenerating ? (
          <span className="flex items-center justify-center gap-2 text-blue-600">
            <svg className="animate-spin h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>{getStepText()}</span>
          </span>
        ) : (
          freeButtonText
        )}
      </button>
    </section>
  );
}
