"use client";

import React from "react";
import {
  PAID_BENEFIT_TEXT,
  PAID_SUB_TEXT,
  REFUND_SUMMARY_TEXT,
  freeLimitButtonText,
} from "@/lib/policy";
import { BUSINESS_INFO } from "@/lib/siteConfig";

export interface PaymentSectionProps {
  priceDisplay?: string;
  title?: string;
  subTitle?: string;
  badgeText?: string;
  customerEmail: string;
  onCustomerEmailChange: (email: string) => void;
  emailInputId?: string;
  agreedToRefundPolicy: boolean;
  onAgreedChange: (agreed: boolean) => void;
  refundCheckboxId?: string;
  guaranteeBenefitText?: string;
  error?: string;
  refundNotice?: string;
  refundPendingNotice?: string;
  activeOrder?: { orderId: string; remainingGenerations: number } | null;
  onUseActiveOrder?: () => void;
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
  generatingBannerText?: string;
  widgetContainerId?: string;
  agreementContainerId?: string;
  kakaoChannelUrl?: string | null;
  comparisonTable?: React.ReactNode;
}

export default function PaymentSection({
  priceDisplay = "4,900",
  title,
  subTitle = "토스페이먼츠 보안 모듈을 통해 안전하게 결제됩니다.",
  badgeText = "단건 결제",
  customerEmail,
  onCustomerEmailChange,
  emailInputId = "customer-email",
  agreedToRefundPolicy,
  onAgreedChange,
  refundCheckboxId = "refund-agree",
  guaranteeBenefitText = PAID_BENEFIT_TEXT,
  error,
  refundNotice,
  refundPendingNotice,
  activeOrder,
  onUseActiveOrder,
  paymentState,
  paymentTimeoutMsg,
  onRetryPayment,
  onPaymentClick,
  paidButtonText,
  paidButtonSubText = PAID_SUB_TEXT,
  processingText = "결제창을 준비하고 있습니다...",
  isGenerating,
  onFreeGenerate,
  freeButtonText = freeLimitButtonText("resume"),
  generatingText = "AI 생성 진행 중...",
  generatingBannerText = "AI가 입력 경험을 바탕으로 맞춤 문장을 작성 중입니다 (보통 10~15초 소요)",
  widgetContainerId = "payment-widget",
  agreementContainerId = "agreement",
  kakaoChannelUrl,
  comparisonTable,
}: PaymentSectionProps) {
  const displayTitle = title || `결제 및 생성 (${priceDisplay}원)`;
  const displayPaidText = paidButtonText || `${priceDisplay}원 결제하고 완성하기`;
  const effectiveKakaoUrl = kakaoChannelUrl ?? BUSINESS_INFO.kakaoChannelUrl;

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

      {/* 보유 중인 유료 이용권 배너 (잔여 횟수 활용 또는 일시 오류 후 재시도용) */}
      {activeOrder && activeOrder.remainingGenerations > 0 && onUseActiveOrder && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-xs sm:text-sm text-blue-900">
            <p className="font-bold">
              보유 중인 이용권이 있습니다 (잔여 {activeOrder.remainingGenerations}회)
            </p>
            <p className="text-xs text-blue-700 mt-0.5 font-mono">
              주문번호: {activeOrder.orderId}
            </p>
          </div>
          <button
            type="button"
            onClick={onUseActiveOrder}
            disabled={isGenerating}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold text-xs sm:text-sm rounded-lg transition-colors cursor-pointer shrink-0"
          >
            {isGenerating ? generatingText : "보유 이용권으로 생성하기 →"}
          </button>
        </div>
      )}

      {/* 자동 전액 환불 완료 안내 배너 */}
      {refundNotice && (
        <div
          role="alert"
          className="p-4 bg-purple-50 border border-purple-200 text-purple-900 rounded-xl text-xs sm:text-sm space-y-1.5"
        >
          <p className="font-bold">{refundNotice}</p>
          <p className="text-xs text-purple-800">
            토스페이먼츠를 통해 전액 환불이 요청되었으며 해당 주문 이용권은 즉시 무효화되었습니다. 카드사·결제수단에 따라 환불 반영까지 영업일 기준 1~3일이 소요될 수 있습니다.
          </p>
        </div>
      )}

      {/* 환불 처리 중(지연 시 고객센터 안내) 배너 */}
      {refundPendingNotice && (
        <div
          role="alert"
          className="p-4 bg-amber-50 border border-amber-300 text-amber-950 rounded-xl text-xs sm:text-sm space-y-2"
        >
          <p className="font-bold">{refundPendingNotice}</p>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {effectiveKakaoUrl && (
              <a
                href={effectiveKakaoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-3 py-1.5 rounded-lg bg-amber-600 text-white font-semibold hover:bg-amber-700 transition-colors"
              >
                카카오톡 채널 문의하기 ↗
              </a>
            )}
            <a
              href={`mailto:${BUSINESS_INFO.email}`}
              className="text-amber-900 underline font-semibold hover:text-amber-700"
            >
              고객센터 이메일 ({BUSINESS_INFO.email})
            </a>
          </div>
        </div>
      )}

      {/* 결과 재열람 링크 및 영수증 안내 이메일 입력란 */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={emailInputId} className="text-xs sm:text-sm font-bold text-gray-800">
          결과 재열람 링크 · 영수증 안내 이메일{" "}
          <span className="text-blue-600 font-semibold">(유료 결제 시 필수)</span>
        </label>
        <input
          id={emailInputId}
          type="email"
          value={customerEmail}
          onChange={(e) => onCustomerEmailChange(e.target.value)}
          placeholder="example@email.com"
          autoComplete="email"
          className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        />
        <p className="text-[11px] text-gray-500 leading-relaxed break-keep">
          결제 후 생성이 완료되면 7일간 보관되는 재열람 링크와 토스 영수증 안내를 메일로도 발송해 드립니다. (무료 체험 시에는 입력하지 않아도 됩니다.)
        </p>
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
          <strong>[필수]</strong> 결제 완료 시 즉시 AI 생성이 시작되는 디지털 콘텐츠 특성상, 생성 시작 후 단순 변심에 의한 환불이 불가함에 동의합니다. ({REFUND_SUMMARY_TEXT}){" "}
          <a
            href="/refund"
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-blue-600 underline font-semibold whitespace-nowrap"
          >
            환불정책 보기
          </a>
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

      {/* 에러 메시지 */}
      {error && paymentState !== "timeout" && !refundNotice && !refundPendingNotice && (
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

      {/* 생성 대기 진행 상태 안내 */}
      {isGenerating && (
        <div id="generation-progress-banner" className="p-4 bg-blue-50 border border-blue-200 rounded-xl flex flex-col gap-3 animate-fadeIn">
          <div className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4 text-blue-600 shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="text-xs sm:text-sm font-bold text-blue-900 leading-snug">
              {generatingBannerText}
            </span>
          </div>
          <div className="w-full bg-blue-200/60 rounded-full h-1.5 overflow-hidden relative">
            <div className="bg-blue-600 rounded-full animate-indeterminate" />
          </div>
        </div>
      )}

      {/* 패키지 구성 비교표 (결제 버튼 바로 위) */}
      {comparisonTable && <div>{comparisonTable}</div>}

      {/* 국외 이전(Google) 고지 */}
      <p className="text-[11px] sm:text-xs text-gray-500 text-center break-keep">
        입력 내용은 AI 생성을 위해 Google 서버로 전송되며 저장되지 않습니다.{" "}
        <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
          개인정보처리방침
        </a>
      </p>

      {/* 결제 버튼 */}
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
            <span>{generatingText}</span>
          </span>
        ) : (
          freeButtonText
        )}
      </button>

      {/* 카카오톡 채널 문의 링크 (설정 시에만 노출) */}
      {effectiveKakaoUrl && (
        <p className="text-xs text-gray-500 text-center">
          결제·환불·이용 문의:{" "}
          <a
            href={effectiveKakaoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline font-semibold hover:text-blue-800"
          >
            카카오톡 채널 문의하기 ↗
          </a>
        </p>
      )}
    </section>
  );
}
