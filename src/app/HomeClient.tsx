"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { loadPaymentWidget, PaymentWidgetInstance } from "@tosspayments/payment-widget-sdk";
import {
  FinalCta,
  HeroReportCard,
  HowItWorks,
  PricingCards,
  SafetyPoints,
  ShowcaseSection,
  TrustBar,
} from "@/components/LandingSections";
import PaymentSection from "@/components/PaymentSection";
import PackageComparisonTable from "@/components/PackageComparisonTable";
import DiagnosisReportView from "@/components/DiagnosisReportView";
import PackageResultTabs from "@/components/PackageResultTabs";
import PaidResultShareCard, { downloadTextFile } from "@/components/PaidResultShareCard";
import FAQAccordion from "@/components/FAQAccordion";
import type { FreeDiagnosticResponse } from "@/lib/diagnoseRubric";
import type { HomeJobContextSummary } from "@/lib/jobContext";
import { countResumeMetrics } from "@/lib/textMetrics";
import type {
  InterviewQuestionItem,
  LockedResumeQuestionItem,
  ResumeQuestionItem,
} from "@/lib/results";
import {
  AI_DRAFT_REVIEW_NOTICE,
  FREE_LIMITS,
  PAID_BENEFIT_TEXT,
  PAID_GENERATIONS,
  PAID_GENERATIONS_BREAKDOWN,
  PAID_INTERVIEW_BREAKDOWN,
  PAID_SUB_TEXT,
  PRICING_PLANS,
  freeLimitButtonText,
  freeLimitExceededMessage,
  normalizeEmail,
} from "@/lib/policy";
import {
  getSessionAnalyticsSource,
  trackConversionEvent,
} from "@/lib/analytics";

const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY || "test_gck_EXAMPLETEST";
const customerKey = "GUEST"; // 비회원 결제

/** 서비스 기본 결제 금액 (원). 정책 상수(PRICING_PLANS)를 직접 참조합니다. */
const PRICE = PRICING_PLANS.resume_single.price;
const PRICE_DISPLAY = PRICE.toLocaleString("ko-KR"); // "4,900"
const BUNDLE_PRICE = PRICING_PLANS.bundle.price;
const BUNDLE_PRICE_DISPLAY = BUNDLE_PRICE.toLocaleString("ko-KR"); // "7,900"
const UPGRADE_ADD_PRICE_DISPLAY = PRICING_PLANS.interview_upgrade.price.toLocaleString("ko-KR"); // "3,000"

const LS_DIAGNOSIS_TEXT = "resumeDiagnosisDraft";
const LS_DIAGNOSIS_REPORT = "resumeDiagnosisReport";
const LS_DRAFT_MEMO = "resumeDraft";
const LS_PREVIEW_STATE = "resumePreviewState";

interface PaidResultInfo {
  orderId: string;
  planType?: string | null;
  linkedInterviewOrderId?: string | null;
  resultToken: string;
  resultUrl: string;
  expiresAt: string | null;
  remainingGenerations: number;
  receiptUrl: string | null;
  emailSent: boolean;
}

export default function Home({
  kakaoChannelUrl,
  paymentLocked = false,
  initialJobContext = null,
}: {
  kakaoChannelUrl?: string | null;
  paymentLocked?: boolean;
  initialJobContext?: HomeJobContextSummary | null;
}) {
  const [inputMode, setInputMode] = useState<"diagnose" | "draft">("diagnose");
  const [activeJobContext, setActiveJobContext] =
    useState<HomeJobContextSummary | null>(initialJobContext ?? null);

  // 진단받기 모드 상태 (원문은 브라우저 localStorage에만 임시 보관)
  const [diagnosisText, setDiagnosisText] = useState("");
  const [questionPrompt, setQuestionPrompt] = useState("");
  const [targetChars, setTargetChars] = useState<number>(700);
  const [diagnosisReport, setDiagnosisReport] = useState<FreeDiagnosticResponse | null>(null);
  const [isDiagnosing, setIsDiagnosing] = useState(false);

  // 진단 원문 유실 복구 상태 (결제 후 localStorage 유실 시 횟수 차감 없이 재입력)
  const [missingDiagnosisOrderId, setMissingDiagnosisOrderId] = useState<string | null>(null);
  const [recoveryText, setRecoveryText] = useState("");

  // 메모로 새로 쓰기 모드 상태
  const [resumePrompt, setResumePrompt] = useState("");
  const [selectedJobTitle, setSelectedJobTitle] = useState(
    initialJobContext ? `[${initialJobContext.instName}] ${initialJobContext.title}` : ""
  );

  // 미리보기 & 패키지 결과 상태
  const [previewToken, setPreviewToken] = useState<string | null>(null);
  const [previewExpiresAt, setPreviewExpiresAt] = useState<string | null>(null);
  const [packageItems, setPackageItems] = useState<ResumeQuestionItem[]>([]);
  const [lockedItems, setLockedItems] = useState<LockedResumeQuestionItem[]>([]);
  const [interviewQuestions, setInterviewQuestions] = useState<InterviewQuestionItem[]>([]);
  const [interviewPending, setInterviewPending] = useState(false);
  const [isRetryingInterview, setIsRetryingInterview] = useState(false);

  const [customerEmail, setCustomerEmail] = useState("");
  const [agreedToRefundPolicy, setAgreedToRefundPolicy] = useState(false);
  const [includeInterviewBundle, setIncludeInterviewBundle] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationElapsedSec, setGenerationElapsedSec] = useState(0);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [refundNotice, setRefundNotice] = useState("");
  const [refundPendingNotice, setRefundPendingNotice] = useState("");
  const [activeOrder, setActiveOrder] = useState<{
    orderId: string;
    remainingGenerations: number;
  } | null>(null);
  const [paidResultInfo, setPaidResultInfo] = useState<PaidResultInfo | null>(null);
  const [isWidgetReady, setIsWidgetReady] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const [paymentState, setPaymentState] = useState<"idle" | "processing" | "timeout" | "error">("idle");
  const [paymentTimeoutMsg, setPaymentTimeoutMsg] = useState("");

  const paymentWidgetRef = useRef<PaymentWidgetInstance | null>(null);
  const paymentMethodsWidgetRef = useRef<any>(null);
  const timeoutTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isWidgetReadyRef = useRef(false);

  const diagnosisMetrics = useMemo(
    () => countResumeMetrics(diagnosisText, targetChars),
    [diagnosisText, targetChars]
  );

  const selectedPrice = includeInterviewBundle ? BUNDLE_PRICE : PRICE;
  const selectedPriceDisplay = selectedPrice.toLocaleString("ko-KR");

  useEffect(() => {
    if (!isGenerating) {
      setGenerationElapsedSec(0);
      return;
    }
    setGenerationElapsedSec(0);
    const timer = setInterval(() => {
      setGenerationElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isGenerating]);

  useEffect(() => {
    isWidgetReadyRef.current = isWidgetReady;
    if (isWidgetReady && paymentMethodsWidgetRef.current?.updateAmount) {
      try {
        paymentMethodsWidgetRef.current.updateAmount(selectedPrice);
      } catch (err) {
        console.warn("결제 위젯 금액 갱신 실패:", err);
      }
    }
  }, [isWidgetReady, selectedPrice]);

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
    const savedDiagnosis = localStorage.getItem(LS_DIAGNOSIS_TEXT);
    if (savedDiagnosis) {
      setDiagnosisText(savedDiagnosis);
    }

    const savedReportRaw = localStorage.getItem(LS_DIAGNOSIS_REPORT);
    let savedWeaknesses: string[] = [];
    if (savedReportRaw) {
      try {
        const parsed = JSON.parse(savedReportRaw) as FreeDiagnosticResponse;
        if (parsed && typeof parsed.totalScore === "number") {
          setDiagnosisReport(parsed);
          savedWeaknesses = (parsed.topWeaknesses || [])
            .map((w) => `${w.title}: ${w.description || ""}`)
            .filter(Boolean);
        }
      } catch {
        // ignore invalid localStorage
      }
    }

    const savedDraft = localStorage.getItem(LS_DRAFT_MEMO);
    if (savedDraft) {
      setResumePrompt(savedDraft);
    }

    const savedPreviewRaw = localStorage.getItem(LS_PREVIEW_STATE);
    let savedPreviewToken: string | null = null;
    if (savedPreviewRaw) {
      try {
        const parsed = JSON.parse(savedPreviewRaw) as {
          previewToken?: string;
          expiresAt?: string;
        };
        if (parsed.previewToken) {
          savedPreviewToken = parsed.previewToken;
          setPreviewToken(parsed.previewToken);
          setPreviewExpiresAt(parsed.expiresAt || null);
        }
      } catch {
        // ignore
      }
    }

    const savedEmail = localStorage.getItem("lastCustomerEmail");
    if (savedEmail) {
      setCustomerEmail(savedEmail);
    }

    // 채용공고 등에서 공고명(jobTitle) 파라미터가 전달된 경우 타겟팅 배지 활성화
    const urlParams = new URLSearchParams(window.location.search);
    const jobTitleParam = urlParams.get("jobTitle") || urlParams.get("job");
    const modeParam = urlParams.get("mode");
    if (modeParam === "draft") {
      setInputMode("draft");
    }
    if (jobTitleParam) {
      setSelectedJobTitle(jobTitleParam.trim());
      setTimeout(() => {
        const el = document.getElementById("resume-form");
        if (el) el.scrollIntoView({ behavior: "smooth" });
      }, 300);
    }

    // 결제 완료 리다이렉트 복귀 처리
    const successOrderId = urlParams.get("orderId");
    if (successOrderId) {
      setActiveOrder({
        orderId: successOrderId,
        remainingGenerations: PAID_GENERATIONS,
      });
      window.history.replaceState({}, document.title, "/");

      const checkoutRaw = localStorage.getItem(`orderCheckout:${successOrderId}`);
      let checkoutFlow: "diagnose" | "draft" = "draft";
      let checkoutPreviewToken: string | null = savedPreviewToken;
      let checkoutJobTitle = jobTitleParam?.trim() || "";
      let checkoutJobSn: number | null = initialJobContext?.sn ?? null;
      let checkoutWeaknesses = savedWeaknesses;

      if (checkoutRaw) {
        try {
          const parsed = JSON.parse(checkoutRaw);
          if (parsed.flow === "diagnose") checkoutFlow = "diagnose";
          if (parsed.previewToken) checkoutPreviewToken = parsed.previewToken;
          if (parsed.jobTitle) checkoutJobTitle = parsed.jobTitle;
          if (typeof parsed.jobSn === "number" && parsed.jobSn > 0) {
            checkoutJobSn = parsed.jobSn;
          }
          if (Array.isArray(parsed.weaknesses)) checkoutWeaknesses = parsed.weaknesses;
        } catch {
          // ignore
        }
      }

      if (checkoutFlow === "diagnose") {
        setInputMode("diagnose");
        if (savedDiagnosis && savedDiagnosis.trim().length > 0) {
          handlePaidGenerate(successOrderId, {
            fromDiagnosis: true,
            memo: savedDiagnosis,
            jobTitle: checkoutJobTitle,
            jobSn: checkoutJobSn,
            diagnosticWeaknesses: checkoutWeaknesses,
          });
        } else {
          // 브라우저 변경·저장소 초기화 등으로 원문 유실 -> 횟수 차감 없이 복구 UI 표시
          setMissingDiagnosisOrderId(successOrderId);
          setTimeout(() => {
            document.getElementById("diagnosis-recovery-box")?.scrollIntoView({ behavior: "smooth" });
          }, 150);
        }
      } else {
        setInputMode("draft");
        if (checkoutPreviewToken || (savedDraft && savedDraft.trim().length > 0)) {
          handlePaidGenerate(successOrderId, {
            fromDiagnosis: false,
            previewToken: checkoutPreviewToken,
            memo: savedDraft || "",
            jobTitle: checkoutJobTitle,
            jobSn: checkoutJobSn,
          });
        }
      }
    }

    if (!paymentLocked) {
      initPaymentWidget();
    }

    return () => {
      if (timeoutTimerRef.current) {
        clearTimeout(timeoutTimerRef.current);
      }
    };
  }, []);

  const handleDiagnosisTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setDiagnosisText(v);
    localStorage.setItem(LS_DIAGNOSIS_TEXT, v);
    if (error) setError("");
  };

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setResumePrompt(v);
    localStorage.setItem(LS_DRAFT_MEMO, v);
    if (error) setError("");
  };

  const scrollToForm = (targetMode?: "diagnose" | "draft") => {
    if (targetMode) setInputMode(targetMode);
    const el = document.getElementById("resume-form");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  const scrollToPayment = () => {
    const el = document.getElementById("payment-section-anchor");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  // 무료 자소서 진단 실행 (/api/diagnose)
  const handleRunDiagnosis = async () => {
    const text = diagnosisText.trim();
    if (text.length < 80) {
      setError("정확한 진단을 위해 자소서 원문을 최소 80자 이상 입력해 주세요.");
      scrollToForm("diagnose");
      return;
    }

    setIsDiagnosing(true);
    setError("");
    setRefundNotice("");
    setRefundPendingNotice("");

    try {
      const res = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          jobTitle: selectedJobTitle.trim(),
          questionPrompt: questionPrompt.trim(),
          targetChars,
          ...(activeJobContext?.sn ? { sn: activeJobContext.sn } : {}),
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 429) {
          throw new Error(freeLimitExceededMessage("resume"));
        }
        throw new Error(data?.error || "진단 분석 중 오류가 발생했습니다.");
      }

      setDiagnosisReport(data);
      localStorage.setItem(LS_DIAGNOSIS_REPORT, JSON.stringify(data));
      trackConversionEvent({ event: "diagnose_run", planType: "free" });
      setTimeout(() => {
        document.getElementById("diagnosis-result-section")?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } catch (err: any) {
      setError(err.message || "진단 중 오류가 발생했습니다.");
    } finally {
      setIsDiagnosing(false);
    }
  };

  // 무료 4문항 일괄 생성 후 1문항 미리보기 (/api/generate, isFree: true)
  const handleFreeDraftGenerate = async () => {
    const textToUse = resumePrompt.trim();
    if (!textToUse) {
      setError("핵심 경험 메모를 먼저 입력해 주세요.");
      scrollToForm("draft");
      return;
    }

    setIsGenerating(true);
    setError("");
    setRefundNotice("");
    setRefundPendingNotice("");
    setResult("");
    setPackageItems([]);
    setLockedItems([]);
    setInterviewQuestions([]);
    setInterviewPending(false);
    setPaidResultInfo(null);

    setTimeout(() => {
      document.getElementById("generation-progress-banner")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 50);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobTitle: selectedJobTitle.trim() ? selectedJobTitle.trim() : "일반 직무",
          memo: textToUse,
          isFree: true,
          mode: "draft",
          ...(activeJobContext?.sn ? { sn: activeJobContext.sn } : {}),
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 429) {
          throw new Error(freeLimitExceededMessage("resume"));
        }
        throw new Error(data?.error || "생성 중 오류가 발생했습니다.");
      }

      setResult(data.text || "");
      setPackageItems(Array.isArray(data.items) ? data.items : []);
      setLockedItems(Array.isArray(data.lockedItems) ? data.lockedItems : []);
      trackConversionEvent({ event: "draft_run", planType: "free" });

      if (data.previewToken) {
        setPreviewToken(data.previewToken);
        setPreviewExpiresAt(data.previewExpiresAt || null);
        localStorage.setItem(
          LS_PREVIEW_STATE,
          JSON.stringify({
            previewToken: data.previewToken,
            expiresAt: data.previewExpiresAt || null,
          })
        );
      }

      setTimeout(() => {
        document.getElementById("result-section")?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } catch (err: any) {
      setError(err.message || "생성 중 오류가 발생했습니다.");
    } finally {
      setIsGenerating(false);
    }
  };

  // 유료 패키지 생성/잠금해제 (/api/generate, isFree: false)
  const handlePaidGenerate = async (
    paidOrderId: string,
    opts?: {
      fromDiagnosis?: boolean;
      memo?: string;
      previewToken?: string | null;
      jobTitle?: string;
      jobSn?: number | null;
      diagnosticWeaknesses?: string[];
      useFreshGeneration?: boolean;
    }
  ) => {
    const isDiagFlow = Boolean(opts?.fromDiagnosis);
    const memoToSend =
      opts?.memo !== undefined
        ? opts.memo.trim()
        : (isDiagFlow ? diagnosisText : resumePrompt).trim();

    if (isDiagFlow && !memoToSend) {
      setMissingDiagnosisOrderId(paidOrderId);
      setError("자소서 원문을 다시 붙여넣어 주세요. (결제 횟수는 차감되지 않습니다)");
      return;
    }

    setIsGenerating(true);
    setError("");
    setRefundNotice("");
    setRefundPendingNotice("");

    setTimeout(() => {
      document.getElementById("generation-progress-banner")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 50);

    try {
      const cleanEmail = normalizeEmail(customerEmail);
      const tokenToSend = opts?.useFreshGeneration
        ? null
        : opts?.previewToken !== undefined
          ? opts.previewToken
          : previewToken;

      const resolvedSn = opts?.jobSn ?? activeJobContext?.sn ?? null;
      const payload: Record<string, any> = {
        orderId: paidOrderId,
        isFree: false,
        jobTitle: (opts?.jobTitle ?? selectedJobTitle).trim() || "일반 직무",
        memo: memoToSend,
        fromDiagnosis: isDiagFlow,
        ...(resolvedSn ? { sn: resolvedSn } : {}),
        ...(tokenToSend ? { previewToken: tokenToSend } : {}),
        ...(opts?.diagnosticWeaknesses
          ? { diagnosticWeaknesses: opts.diagnosticWeaknesses }
          : {}),
        ...(cleanEmail ? { email: cleanEmail } : {}),
      };

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (data?.code === "DIAGNOSIS_TEXT_MISSING") {
          setMissingDiagnosisOrderId(paidOrderId);
          throw new Error("자소서 원문을 다시 붙여넣어 주세요.");
        }
        if (data?.refunded || data?.code === "AUTO_REFUNDED") {
          const msg = data?.error || "생성 오류로 결제가 자동 전액 환불되었습니다";
          setRefundNotice(msg);
          setActiveOrder(null);
          throw new Error(msg);
        }
        if (
          data?.refundPending ||
          data?.code === "REFUND_PENDING" ||
          data?.order?.status === "refund_failed" ||
          res.status === 502
        ) {
          const msg =
            data?.error ||
            "환불 처리 중입니다(영업일 기준 1~2일 내 처리). 지연 시 고객센터로 문의해 주세요.";
          setRefundPendingNotice(msg);
          setActiveOrder(null);
          throw new Error(msg);
        }
        if (data?.code === "GENERATION_RETRY_ALLOWED") {
          if (typeof data?.order?.remainingGenerations === "number") {
            setActiveOrder({
              orderId: paidOrderId,
              remainingGenerations: data.order.remainingGenerations,
            });
          }
          throw new Error(
            data?.error ||
              "일시적인 생성 오류로 실패했습니다. 결제 횟수는 차감되지 않았으니 잠시 후 다시 시도해 주세요."
          );
        }
        if (res.status === 409) {
          throw new Error(data?.error || "이미 AI 생성이 진행 중입니다. 잠시만 기다려 주세요.");
        }
        if (res.status === 403) {
          setActiveOrder(null);
          throw new Error(
            data?.error || "결제 정보가 유효하지 않거나 사용 횟수를 모두 소진했습니다."
          );
        }
        throw new Error(data?.error || "생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      }

      setMissingDiagnosisOrderId(null);
      setResult(data.text || "");
      setPackageItems(Array.isArray(data.items) ? data.items : []);
      setLockedItems([]); // 결제 완료 후 잠금 해제!
      setInterviewQuestions(
        Array.isArray(data.interviewQuestions) ? data.interviewQuestions : []
      );
      setInterviewPending(Boolean(data.interviewPending));

      // Branch A 잠금해제 후에도 남은 2회 재생성을 위해 입력 메모 유지
      if (typeof data.sourceMemo === "string" && data.sourceMemo.trim() && !isDiagFlow) {
        setResumePrompt(data.sourceMemo);
        localStorage.setItem(LS_DRAFT_MEMO, data.sourceMemo);
      }

      // 1회성 previewToken 및 진단 원문 localStorage 즉시 정리
      setPreviewToken(null);
      setPreviewExpiresAt(null);
      localStorage.removeItem(LS_PREVIEW_STATE);
      localStorage.removeItem(`orderCheckout:${paidOrderId}`);
      if (isDiagFlow) {
        localStorage.removeItem(LS_DIAGNOSIS_TEXT);
        localStorage.removeItem(LS_DIAGNOSIS_REPORT);
      }

      if (data.order) {
        if (data.order.remainingGenerations > 0) {
          setActiveOrder({
            orderId: data.order.orderId,
            remainingGenerations: data.order.remainingGenerations,
          });
        } else {
          setActiveOrder(null);
        }

        if (data.order.resultUrl) {
          setPaidResultInfo({
            orderId: data.order.orderId,
            planType: data.order.planType ?? null,
            linkedInterviewOrderId: data.order.linkedInterviewOrderId ?? null,
            resultToken: data.resultToken || "",
            resultUrl: data.order.resultUrl,
            expiresAt: data.order.resultExpiresAt ?? null,
            remainingGenerations: data.order.remainingGenerations,
            receiptUrl: data.order.receiptUrl ?? null,
            emailSent: Boolean(data.order.emailSent),
          });
        }
      }

      setTimeout(() => {
        document.getElementById("result-section")?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } catch (err: any) {
      setError(err.message || "오류가 발생했습니다.");
    } finally {
      setIsGenerating(false);
    }
  };

  // 부분 실패 시 추가 차감 없이 면접 질문 10선 무료 재시도
  const handleRetryInterviewOnly = async () => {
    if (!paidResultInfo?.orderId || !paidResultInfo?.resultToken) {
      setError("재열람 링크 페이지에서 면접 질문 재생성을 시도해 주세요.");
      return;
    }

    setIsRetryingInterview(true);
    setError("");
    try {
      const res = await fetch("/api/interview/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: paidResultInfo.orderId,
          resultToken: paidResultInfo.resultToken,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          data?.error || "면접 질문 재생성에 실패했습니다. 잠시 후 다시 시도해 주세요."
        );
      }
      if (Array.isArray(data.interviewQuestions)) {
        setInterviewQuestions(data.interviewQuestions);
      }
      if (typeof data.text === "string" && data.text) {
        setResult(data.text);
      }
      setInterviewPending(false);
    } catch (err: any) {
      setError(err.message || "면접 질문 생성 중 오류가 발생했습니다.");
    } finally {
      setIsRetryingInterview(false);
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

    const cleanEmail = normalizeEmail(customerEmail);
    if (!cleanEmail) {
      setPaymentState("idle");
      setError("결과 재열람 링크 및 영수증 안내를 받을 올바른 이메일 주소를 입력해 주세요.");
      return;
    }

    try {
      const orderId = "order_" + Math.random().toString(36).substring(2, 11);
      localStorage.setItem("lastCustomerEmail", cleanEmail);
      localStorage.setItem(`orderEmail:${orderId}`, cleanEmail);

      const topWeaknesses = (diagnosisReport?.topWeaknesses || [])
        .map((w) => `${w.title}: ${w.description || ""}`)
        .filter(Boolean);

      const selectedPlanType = includeInterviewBundle ? "bundle" : "resume_single";
      const analyticsSource = getSessionAnalyticsSource();

      localStorage.setItem(
        `orderCheckout:${orderId}`,
        JSON.stringify({
          flow: inputMode,
          planType: selectedPlanType,
          previewToken: inputMode === "draft" ? previewToken : null,
          jobTitle: selectedJobTitle.trim(),
          jobSn: activeJobContext?.sn ?? null,
          weaknesses: topWeaknesses,
        })
      );
      localStorage.setItem(
        `paymentCheckoutMeta:${orderId}`,
        JSON.stringify({
          planType: selectedPlanType,
          analyticsSource,
        })
      );

      trackConversionEvent({
        event: "checkout_click",
        source: analyticsSource,
        planType: selectedPlanType,
      });

      // 결제 직전 서버 payment_intent 등록 (미리보기 상태라면 previewToken 매핑·2시간 TTL 연장 동시 수행)
      await fetch("/api/payments/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          planType: selectedPlanType,
          email: cleanEmail,
          ...(inputMode === "draft" && previewToken ? { previewToken } : {}),
        }),
      }).catch(() => null);

      await paymentWidget.requestPayment({
        orderId,
        orderName: includeInterviewBundle
          ? PRICING_PLANS.bundle.label
          : `AI 자소서·면접 완성 패키지 (${PAID_GENERATIONS}회권)`,
        customerEmail: cleanEmail,
        successUrl: window.location.origin + "/payments/success",
        failUrl: window.location.origin + "/payments/fail",
      });
    } catch (err: any) {
      setPaymentState("idle");
      if (err.code !== "USER_CANCEL") {
        trackConversionEvent({
          event: "payment_fail",
          planType: includeInterviewBundle ? "bundle" : "resume_single",
        });
        setError(err.message || "결제 요청 중 오류가 발생했습니다.");
      }
    }
  };

  // 결제 버튼 클릭 핸들러 (10초 타임아웃 및 무한 스피너 방지)
  const handlePaymentClick = async () => {
    if (paymentLocked) {
      setError("결제 서비스 준비 중입니다.");
      return;
    }
    setError("");
    setRefundNotice("");
    setRefundPendingNotice("");
    setPaymentTimeoutMsg("");

    if (inputMode === "diagnose" && !diagnosisText.trim()) {
      setError("진단·완성본으로 교정할 자소서 원문을 먼저 입력해 주세요.");
      scrollToForm("diagnose");
      return;
    }
    if (inputMode === "draft" && !resumePrompt.trim() && !previewToken) {
      setError("자기소개서 작성 메모를 먼저 입력해 주세요.");
      scrollToForm("draft");
      return;
    }

    const cleanEmail = normalizeEmail(customerEmail);
    if (!cleanEmail) {
      setError("결과 재열람 링크 및 영수증 안내를 받을 올바른 이메일 주소를 입력해 주세요.");
      const emailEl = document.getElementById("resume-customer-email");
      if (emailEl) emailEl.focus();
      return;
    }

    if (!agreedToRefundPolicy) {
      setError("결제 진행을 위해 환불 불가 정책에 동의해 주세요.");
      const checkbox = document.getElementById("refund-agree");
      if (checkbox) checkbox.focus();
      return;
    }

    if (isWidgetReady && paymentWidgetRef.current) {
      setPaymentState("idle");
      await executePaymentRequest();
      return;
    }

    setPaymentState("processing");

    if (timeoutTimerRef.current) {
      clearTimeout(timeoutTimerRef.current);
    }

    const checkInterval = setInterval(() => {
      if (isWidgetReadyRef.current && paymentWidgetRef.current) {
        clearInterval(checkInterval);
        if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
        setPaymentState("idle");
        executePaymentRequest();
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
    if (!paymentLocked) {
      initPaymentWidget();
    }
  };

  const handleInterviewRedirect = async () => {
    if (!result) return;
    setIsRedirecting(true);
    try {
      const res = await fetch("/api/interview/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText: result }),
      });
      if (res.ok) {
        const data = await res.json();
        const snSuffix = activeJobContext?.sn ? `&sn=${encodeURIComponent(String(activeJobContext.sn))}` : "";
        window.location.href = `/interview?token=${data.token}${snSuffix}`;
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

        {/* [채용공고 연동 컨텍스트 카드 (/?sn=... 진입 시 서버 DB 조회 결과 표시)] */}
        {activeJobContext && (
          <section
            id="job-context-card"
            aria-label="선택된 채용공고 정보"
            className="bg-white rounded-2xl border-2 border-blue-200 shadow-sm p-4 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fadeIn"
          >
            <div className="space-y-2 min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-extrabold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-lg">
                  {activeJobContext.instName}
                </span>
                <span
                  className={`font-extrabold px-2.5 py-0.5 rounded-lg border ${
                    activeJobContext.isUrgent
                      ? "bg-red-50 text-red-700 border-red-200"
                      : "bg-emerald-50 text-emerald-700 border-emerald-200"
                  }`}
                >
                  {activeJobContext.dDayLabel}
                </span>
                <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-lg">
                  NCS 직무 · {activeJobContext.ncsNames.length > 0 ? activeJobContext.ncsNames.join(", ") : "일반 직무"}
                </span>
                {(activeJobContext.hasQualification || activeJobContext.hasPreference) && (
                  <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                    자격요건 · 우대사항 AI 자동 반영
                  </span>
                )}
              </div>
              <h2 className="text-base sm:text-xl font-extrabold text-gray-900 leading-snug break-keep">
                {activeJobContext.title}
              </h2>
              <p className="text-xs text-gray-500">
                아래에서 이미 쓴 자소서를 무료 진단하거나, 경험 메모로 공고 맞춤 4문항 초안을 바로 작성해 보세요.
              </p>
            </div>

            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => scrollToForm("diagnose")}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm rounded-xl transition-colors cursor-pointer"
              >
                이 공고 자소서 작성 · 진단 ↓
              </button>
              <Link
                href={`/jobs/${activeJobContext.sn}`}
                className="px-3.5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold text-xs sm:text-sm rounded-xl transition-colors"
              >
                공고 상세 ↗
              </Link>
              <button
                type="button"
                onClick={() => {
                  setActiveJobContext(null);
                  setSelectedJobTitle("");
                }}
                className="px-3 py-2.5 bg-white hover:bg-gray-50 border border-gray-200 text-gray-600 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                aria-label="선택된 공고 해제"
              >
                ✕ 해제
              </button>
            </div>
          </section>
        )}

        {/* [히어로 영역] */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-14 items-center py-2 sm:py-8">
          <div className="flex flex-col text-left break-keep">
            <p className="text-sm sm:text-base font-semibold text-blue-600 mb-4">
              공공기관 · 공기업 · 대기업 서류와 면접
            </p>

            <h1 className="text-[2rem] leading-[1.28] sm:text-5xl sm:leading-[1.2] font-extrabold text-gray-900 mb-5">
              자소서, 내기 전에<br />
              <span className="text-blue-600">감점 요인부터</span> 잡으세요
            </h1>

            <p className="text-base sm:text-lg text-gray-600 leading-relaxed mb-8">
              붙여넣기만 하면 STAR 구조, 수치 구체성, 블라인드 규정, 분량을 100점 기준으로 채점하고
              고칠 문장을 짚어 드립니다.
            </p>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <button
                onClick={() => scrollToForm("diagnose")}
                className="w-full sm:w-auto py-4 px-7 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-base sm:text-lg rounded-2xl shadow-lg shadow-blue-600/20 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>무료로 자소서 진단받기</span>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>

              <Link
                href="/sample"
                className="w-full sm:w-auto py-4 px-6 text-center text-base font-semibold text-gray-700 bg-white hover:bg-gray-100 rounded-2xl ring-1 ring-gray-200 transition-colors"
              >
                결과 샘플 보기
              </Link>
            </div>

            <p className="mt-4 text-sm text-gray-500">
              {`회원가입 없이 하루 ${FREE_LIMITS.resume}회 무료 · 원문은 서버에 저장하지 않습니다`}
            </p>
          </div>

          <div className="w-full">
            <HeroReportCard />
          </div>
        </section>

        {/* [진단 원문 유실 복구 배너 (결제 완료 후 브라우저 저장소 유실 시 횟수 차감 없이 재입력)] */}
        {missingDiagnosisOrderId && (
          <section
            id="diagnosis-recovery-box"
            className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-6 sm:p-8 space-y-4 shadow-sm"
          >
            <div className="space-y-1">
              <span className="inline-block text-xs font-extrabold text-amber-800 bg-amber-200/80 px-2.5 py-0.5 rounded">
                결제 확인 완료 · 주문번호 {missingDiagnosisOrderId}
              </span>
              <h2 className="text-lg sm:text-xl font-extrabold text-gray-900">
                자소서 원문을 다시 붙여넣어 주세요
              </h2>
              <p className="text-xs sm:text-sm text-amber-900 leading-relaxed break-keep">
                개인정보 보호를 위해 진단 원문을 서버에 저장하지 않으며, 브라우저 변경·저장소 초기화로 로컬 임시 데이터가 확인되지 않았습니다.{" "}
                <strong>생성 횟수는 아직 차감되지 않았으니</strong> 원문을 아래에 붙여넣고 완성본을 즉시 생성해 주세요.
              </p>
            </div>
            <textarea
              className="w-full h-44 p-4 border border-amber-300 bg-white rounded-xl focus:ring-2 focus:ring-amber-500 outline-none text-sm leading-relaxed"
              placeholder="앞서 진단받으셨던 자기소개서 원문을 붙여넣어 주세요..."
              value={recoveryText}
              onChange={(e) => setRecoveryText(e.target.value)}
            />
            <button
              type="button"
              onClick={() =>
                handlePaidGenerate(missingDiagnosisOrderId, {
                  fromDiagnosis: true,
                  memo: recoveryText,
                })
              }
              disabled={isGenerating || !recoveryText.trim()}
              className="w-full sm:w-auto px-6 py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-extrabold text-sm rounded-xl cursor-pointer transition-colors"
            >
              {isGenerating ? "완성본 생성 중..." : "약점을 고친 완성본 즉시 생성하기 →"}
            </button>
          </section>
        )}

        <TrustBar />
        <HowItWorks />

        {/* [2모드 입력 폼 섹션] */}
        <section id="resume-form" className="scroll-mt-20 bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-200 space-y-5">
          {/* 상단 모드 전환 탭 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-1.5 bg-gray-100 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setInputMode("diagnose");
                setError("");
              }}
              className={`py-3 px-4 rounded-lg text-sm font-extrabold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                inputMode === "diagnose"
                  ? "bg-white text-blue-700 shadow-xs border border-blue-100"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <span>이미 쓴 자소서 진단받기</span>
              <span className="text-[11px] font-bold bg-blue-50 text-blue-600 px-2 py-0.5 rounded">
                기본
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setInputMode("draft");
                setError("");
              }}
              className={`py-3 px-4 rounded-lg text-sm font-extrabold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                inputMode === "draft"
                  ? "bg-white text-blue-700 shadow-xs border border-blue-100"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <span>메모로 새로 쓰기</span>
              <span className="text-[11px] font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded">
                1문항 무료 미리보기
              </span>
            </button>
          </div>

          {selectedJobTitle && (
            <div className="flex items-center justify-between gap-2 p-2.5 sm:px-3.5 sm:py-2 bg-sky-50 border border-sky-200 rounded-xl text-xs text-sky-900">
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
                onClick={() => {
                  setSelectedJobTitle("");
                  setActiveJobContext(null);
                }}
                className="shrink-0 text-sky-600 hover:text-sky-900 hover:bg-sky-100 px-2 py-0.5 rounded-lg transition-colors font-bold text-xs flex items-center gap-1 cursor-pointer"
                title="공고 선택 해제"
                aria-label="공고 선택 해제"
              >
                ✕ 해제
              </button>
            </div>
          )}

          {inputMode === "diagnose" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    지원 문항 (선택)
                  </label>
                  <input
                    type="text"
                    value={questionPrompt}
                    onChange={(e) => setQuestionPrompt(e.target.value)}
                    placeholder="예: 지원동기 및 직무수행 관련 문제해결 경험을 기술하시오"
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    목표 글자수 기준
                  </label>
                  <select
                    value={targetChars}
                    onChange={(e) => setTargetChars(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value={500}>500자 이내</option>
                    <option value={700}>700자 이내</option>
                    <option value={1000}>1,000자 이내</option>
                    <option value={1500}>1,500자 이내</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <label htmlFor="diagnosis-textarea" className="block text-base font-bold text-gray-900">
                    작성한 자소서 원문 붙여넣기 <span className="text-blue-600">*</span>
                  </label>
                  <span className="text-xs font-semibold text-gray-600 bg-gray-100 px-2.5 py-1 rounded-lg">
                    공백 포함 {diagnosisMetrics.charCount}자 · 공백 제외{" "}
                    {diagnosisMetrics.charCountNoSpaces}자 · {diagnosisMetrics.byteCount2B} Byte
                  </span>
                </div>
                <p className="text-xs text-gray-500 mb-2.5 break-keep">
                  STAR 구조·수치 구체성·블라인드 규정 위반·분량 기준을 종합 채점(100점)하고 핵심 약점과 1문장 교정 예시를 무료로 보여드립니다.{" "}
                  <strong className="text-gray-700">원문은 서버에 저장되지 않습니다.</strong>
                </p>
                <textarea
                  id="diagnosis-textarea"
                  className="w-full h-52 p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition resize-none text-sm leading-relaxed"
                  placeholder="작성하신 자기소개서 문항 본문을 붙여넣어 주세요 (최소 80자 ~ 최대 6,000자)."
                  maxLength={6000}
                  value={diagnosisText}
                  onChange={handleDiagnosisTextChange}
                />
              </div>

              <button
                type="button"
                onClick={handleRunDiagnosis}
                disabled={isDiagnosing || isGenerating}
                className="w-full py-3.5 px-5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-extrabold text-sm sm:text-base rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                {isDiagnosing
                  ? "AI 심사위원이 5대 항목 정밀 채점 중..."
                  : `내 자소서 무료 진단받기 (일 ${FREE_LIMITS.resume}회 무료) →`}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="resume-textarea" className="block text-base font-bold text-gray-900">
                    핵심 경험 메모 입력 <span className="text-blue-600">*</span>
                  </label>
                  <span className="text-xs text-gray-500 font-medium">
                    {resumePrompt.length} / 1,500자
                  </span>
                </div>
                <p className="text-xs text-gray-500 mb-2.5 break-keep">
                  지원 직무·경험 키워드만 적어주시면 표준 4문항(지원동기·직무역량·협업갈등·입사후포부)을 한 번에 생성하고, 1번 문항은 무료 미리보기로 전체 공개(2~4번 문항 및 면접 10선은 결제 후 잠금 해제)합니다.{" "}
                  <span className="text-red-600 font-semibold">주민번호·연락처 등 민감정보는 입력하지 마세요.</span>
                </p>
                <textarea
                  id="resume-textarea"
                  className="w-full h-44 p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition resize-none text-sm leading-relaxed"
                  placeholder="예: 공공기관 행정 인턴 6개월 근무. 민원서류 접수 시스템 지연 문제를 발견해 엑셀 매크로와 분류 기준표를 제작함. 팀원 4명과 함께 적용해 처리 시간을 단축함."
                  maxLength={1500}
                  value={resumePrompt}
                  onChange={handlePromptChange}
                />
              </div>

              <button
                type="button"
                onClick={handleFreeDraftGenerate}
                disabled={isGenerating || isDiagnosing}
                className="w-full py-3.5 px-5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-extrabold text-sm sm:text-base rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                {isGenerating
                  ? `4문항 완성본 작성 중 (${generationElapsedSec}초 경과 · 평균 약 33초)...`
                  : `4문항 작성 후 1번 문항 무료 미리보기 (일 ${FREE_LIMITS.resume}회) →`}
              </button>
              {isGenerating && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5 font-semibold">
                    {[
                      "1단계: 문항 분석",
                      "2단계: STAR 초안 작성",
                      "3단계: 블라인드·수치 규칙 검수",
                    ].map((stepLabel, idx) => {
                      const activeIdx =
                        generationElapsedSec < 7 ? 0 : generationElapsedSec < 22 ? 1 : 2;
                      const isDone = idx < activeIdx;
                      const isActive = idx === activeIdx;
                      return (
                        <span key={stepLabel} className="inline-flex items-center gap-1.5">
                          {idx > 0 && <span className="text-blue-300">→</span>}
                          <span
                            className={`px-2 py-0.5 rounded-md border ${
                              isDone
                                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                                : isActive
                                  ? "bg-white border-blue-400 text-blue-900 font-bold"
                                  : "bg-transparent border-transparent text-blue-400"
                            }`}
                          >
                            {isDone ? "✓ " : isActive ? "● " : "○ "}
                            {stepLabel}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                  <span className="text-blue-700 font-bold shrink-0">
                    {generationElapsedSec}초 경과
                  </span>
                </div>
              )}
            </div>
          )}
        </section>

        {/* [진단 리포트 결과 섹션] */}
        {diagnosisReport && inputMode === "diagnose" && (
          <section id="diagnosis-result-section" className="scroll-mt-20">
            <DiagnosisReportView
              report={diagnosisReport}
              onUpgradeClick={paymentLocked ? undefined : scrollToPayment}
              paymentLocked={paymentLocked}
            />
          </section>
        )}

        {/* [생성된 자소서 미리보기 / 유료 패키지 결과 섹션] */}
        {(packageItems.length > 0 || result) && (
          <section id="result-section" className="scroll-mt-20 bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-200 animate-fadeIn space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                {lockedItems.length > 0
                  ? "AI 자소서 1번 문항 무료 미리보기 (2~4번 잠금)"
                  : "공고 지원 완성 패키지 결과"}
              </h2>
              <div className="flex items-center gap-2">
                {!paidResultInfo && result && (
                  <button
                    type="button"
                    onClick={() => downloadTextFile("자기소개서_1문항_미리보기.txt", result)}
                    className="text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded-md border border-blue-200 cursor-pointer"
                  >
                    .txt 다운로드
                  </button>
                )}
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                  {lockedItems.length > 0 ? "미리보기 (2시간 보관)" : "STAR · 블라인드 교정 완료"}
                </span>
              </div>
            </div>

            {paidResultInfo && (
              <PaidResultShareCard
                orderId={paidResultInfo.orderId}
                serviceType="resume"
                resultText={result}
                resultUrl={paidResultInfo.resultUrl}
                expiresAt={paidResultInfo.expiresAt}
                receiptUrl={paidResultInfo.receiptUrl}
                remainingGenerations={paidResultInfo.remainingGenerations}
                emailSent={paidResultInfo.emailSent}
                kakaoChannelUrl={kakaoChannelUrl}
              />
            )}

            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-900">
              ※ 안내: {AI_DRAFT_REVIEW_NOTICE}
            </div>

            {packageItems.length > 0 ? (
              <PackageResultTabs
                items={packageItems}
                lockedItems={lockedItems}
                interviewQuestions={interviewQuestions}
                interviewPending={interviewPending}
                isRetryingInterview={isRetryingInterview}
                onRetryInterview={handleRetryInterviewOnly}
                onUnlockClick={lockedItems.length > 0 && !paymentLocked ? scrollToPayment : undefined}
                paymentLocked={paymentLocked}
                previewExpiresAt={previewExpiresAt}
              />
            ) : (
              <div className="whitespace-pre-wrap bg-gray-50/80 p-5 rounded-xl border border-gray-200 text-sm leading-relaxed font-normal text-gray-800 select-text">
                {result}
              </div>
            )}

            {lockedItems.length === 0 && result && (
              paidResultInfo?.linkedInterviewOrderId ? (
                <Link
                  href={`/interview?orderId=${encodeURIComponent(paidResultInfo.linkedInterviewOrderId)}&bundleFrom=${encodeURIComponent(paidResultInfo.orderId)}&token=${encodeURIComponent(paidResultInfo.resultToken)}`}
                  className="w-full py-4 px-6 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-base rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
                >
                  <span>포함된 AI 면접 시뮬레이터(15문항·45회) 바로 시작하기</span>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </Link>
              ) : !paymentLocked && paidResultInfo?.orderId && paidResultInfo?.resultToken ? (
                <Link
                  href={`/interview?upgradeFrom=${encodeURIComponent(paidResultInfo.orderId)}&token=${encodeURIComponent(paidResultInfo.resultToken)}`}
                  className="w-full py-4 px-6 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-base rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
                >
                  <span>
                    내 자소서로 실전 모의면접 이어하기 (+{UPGRADE_ADD_PRICE_DISPLAY}원 할인 업그레이드)
                  </span>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </Link>
              ) : (
                <button
                  onClick={handleInterviewRedirect}
                  disabled={isRedirecting}
                  className="w-full py-4 px-6 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-emerald-400 text-white font-bold text-base rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isRedirecting ? (
                    <span>모의면접 페이지로 이동 중...</span>
                  ) : (
                    <>
                      <span>실전 모의면접 꼬리질문 더 연습하기</span>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </>
                  )}
                </button>
              )
            )}
          </section>
        )}

        {/* [결제 및 생성 섹션 (공통 컴포넌트)] */}
        <div id="payment-section-anchor" className="scroll-mt-20">
          <PaymentSection
            priceDisplay={selectedPriceDisplay}
            title={
              includeInterviewBundle
                ? `자소서+면접 통합 패키지 결제 (${BUNDLE_PRICE_DISPLAY}원)`
                : `공고 지원 완성 패키지 결제 (${PRICE_DISPLAY}원)`
            }
            subTitle={
              includeInterviewBundle
                ? `자소서 4문항(${PAID_GENERATIONS_BREAKDOWN}) + 면접 시뮬레이터 (${PAID_INTERVIEW_BREAKDOWN})`
                : `자소서 4문항 완성본 + 맞춤 면접 질문 10선 + ${PAID_GENERATIONS_BREAKDOWN} 포함`
            }
            bundleAddOn={{
              checked: includeInterviewBundle,
              onChange: setIncludeInterviewBundle,
              badgeText: `1,900원 할인 · 합계 ${BUNDLE_PRICE_DISPLAY}원`,
              title: `면접 연습 추가 (+${UPGRADE_ADD_PRICE_DISPLAY}원)`,
              description: `자소서 기반 공공기관 면접 시뮬레이터(직무 10+인성 5 = 총 15문항 · 최대 45회 답변 채점·꼬리질문 · 7일 대비 노트)를 함께 이용합니다.`,
            }}
            customerEmail={customerEmail}
            onCustomerEmailChange={(v) => {
              setCustomerEmail(v);
              if (error) setError("");
            }}
            emailInputId="resume-customer-email"
            agreedToRefundPolicy={agreedToRefundPolicy}
            onAgreedChange={setAgreedToRefundPolicy}
            refundCheckboxId="refund-agree"
            guaranteeBenefitText={
              includeInterviewBundle
                ? `${PAID_BENEFIT_TEXT} + 면접 시뮬레이터 15문항·45회 통합 제공`
                : PAID_BENEFIT_TEXT
            }
            error={error}
            refundNotice={refundNotice}
            refundPendingNotice={refundPendingNotice}
            activeOrder={activeOrder}
            onUseActiveOrder={() =>
              activeOrder &&
              handlePaidGenerate(activeOrder.orderId, {
                fromDiagnosis: inputMode === "diagnose",
                useFreshGeneration: true,
              })
            }
            paymentState={paymentState}
            paymentTimeoutMsg={paymentTimeoutMsg}
            onRetryPayment={handleRetryPayment}
            onPaymentClick={handlePaymentClick}
            paidButtonText={
              includeInterviewBundle
                ? `${BUNDLE_PRICE_DISPLAY}원 결제하고 자소서+면접 통합 완성하기`
                : inputMode === "diagnose"
                  ? `약점을 고친 완성본 받기 (${PRICE_DISPLAY}원)`
                  : lockedItems.length > 0
                    ? `나머지 3문항 + 면접 10선 잠금해제 (${PRICE_DISPLAY}원)`
                    : `${PRICE_DISPLAY}원 결제하고 4문항·면접 10선 완성하기`
            }
            paidButtonSubText={
              includeInterviewBundle
                ? `자소서 ${PAID_GENERATIONS_BREAKDOWN} + 면접 ${PAID_INTERVIEW_BREAKDOWN}`
                : PAID_SUB_TEXT
            }
            isGenerating={isGenerating || isDiagnosing}
            onFreeGenerate={() =>
              inputMode === "diagnose"
                ? handleRunDiagnosis()
                : handleFreeDraftGenerate()
            }
            freeButtonText={
              inputMode === "diagnose"
                ? `먼저 무료로 자소서 진단받기 (일 ${FREE_LIMITS.resume}회)`
                : `먼저 무료로 4문항 중 1문항 미리보기 (일 ${FREE_LIMITS.resume}회)`
            }
            generatingText={
              isDiagnosing
                ? "자소서 무료 진단 분석 중..."
                : "4문항 + 면접 10선 생성 중..."
            }
            generatingBannerText={
              isDiagnosing
                ? "AI 심사위원이 5대 채점 기준에 따라 점수와 약점을 분석하고 있습니다 (약 10초 소요)"
                : "표준 4문항 자소서와 맞춤형 면접 질문 10선을 생성하고 있습니다 (평균 약 30~35초 소요)"
            }
            progressSteps={
              isDiagnosing
                ? undefined
                : [
                    "1단계: 문항 분석",
                    "2단계: STAR 초안 작성",
                    "3단계: 블라인드·수치 규칙 검수",
                  ]
            }
            kakaoChannelUrl={kakaoChannelUrl}
            paymentLocked={paymentLocked}
            comparisonTable={<PackageComparisonTable />}
          />
        </div>

        {/* [랜딩 섹션: 교정 전/후 · 가격 · 안심 포인트] */}
        <ShowcaseSection />
        <PricingCards onStart={scrollToForm} />
        <SafetyPoints />

        {/* [FAQ 섹션] */}
        <FAQAccordion />

        <FinalCta onStart={scrollToForm} />

      </div>
    </main>
  );
}
