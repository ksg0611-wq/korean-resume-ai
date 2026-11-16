"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import {
  loadPaymentWidget,
  PaymentWidgetInstance,
} from "@tosspayments/payment-widget-sdk";
import PaymentSection from "@/components/PaymentSection";
import PaidResultShareCard, {
  downloadTextFile,
} from "@/components/PaidResultShareCard";
import InterviewPreviewCard from "@/components/InterviewPreviewCard";
import InterviewSimulatorWorkspace from "@/components/InterviewSimulatorWorkspace";
import FAQAccordion from "@/components/FAQAccordion";
import {
  DEFAULT_INTERVIEW_JOB_CATEGORY,
  FREE_LIMITS,
  INTERVIEW_MAX_EVALUATIONS,
  PAID_INTERVIEW_BENEFIT_TEXT,
  PAID_INTERVIEW_BREAKDOWN,
  PAID_INTERVIEW_GENERATIONS,
  PRICING_PLANS,
  freeLimitExceededMessage,
  normalizeEmail,
} from "@/lib/policy";
import { INTERVIEW_JOB_CATEGORIES } from "@/lib/interviewRubric";
import type { InterviewSessionRecord } from "@/lib/interviewSession";

const INTERVIEW_SAMPLE_RESUME = `[지원동기 및 직무 경험]
공공기관의 투명한 예산 집행과 안정적인 행정 서비스 운영에 기여하기 위해 지원했습니다. 저는 OO공단 경영지원 부서 행정 인턴으로 5개월간 근무하며 계약·지출 결의 증빙 검수와 부서 내 서류 반려 이력 관리 업무를 보조했습니다.
초기에는 담당자마다 증빙 체크 항목 기준이 달라 보완 요청이 반복되었고, 이로 인해 지출 처리 기한이 평균 2일 이상 지연되는 문제가 있었습니다. 이를 해결하기 위해 기존 감사 지적 사례와 회계 규정 체크리스트 12개 항목을 표준화하고 만기 알림 표를 공유 드라이브에 구축했습니다. 그 결과 인턴 기간 마지막 2개월 동안 담당 파트의 서류 보완 반려 건수를 기존 9건에서 2건으로 줄였고 지출 검수 기한 준수율 95%를 기록했습니다.`;

const clientKey =
  process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY || "test_gck_EXAMPLETEST";
const customerKey = "GUEST";
const PRICE = PRICING_PLANS.interview_single.price;
const PRICE_DISPLAY = PRICE.toLocaleString("ko-KR");
const ACTIVE_SESSION_STORAGE_KEY = "interviewActiveSession";

interface PaidResultInfo {
  orderId: string;
  resultUrl: string;
  resultToken: string;
  expiresAt: string | null;
  remainingGenerations: number;
  receiptUrl: string | null;
  emailSent: boolean;
}

function buildClientNoteSummaryText(session: InterviewSessionRecord): string {
  const lines: string[] = [
    `공공기관 AI 면접 시뮬레이터 대비 노트 (${session.jobCategory})`,
    `총 ${session.questions.length}문항 · 채점 사용: ${session.usedEvaluations}/${session.maxEvaluations}회`,
    "",
  ];
  for (const q of session.questions) {
    const t = session.threads[q.id];
    lines.push(`Q${q.number}. [${q.ncsCompetency}] ${q.question}`);
    if (t?.initialAnswer && t.initialEvaluation) {
      lines.push(`- 내 답변 (${t.initialEvaluation.totalScore}점): ${t.initialAnswer}`);
      if (t.initialEvaluation.modelAnswer) {
        lines.push(`- 교정 모범 답변: ${t.initialEvaluation.modelAnswer}`);
      }
      for (const f of t.followUps || []) {
        lines.push(`  [꼬리질문 ${f.depth}단계] ${f.question}`);
        if (f.userAnswer && f.evaluation) {
          lines.push(`  -> 내 답변 (${f.evaluation.totalScore}점): ${f.userAnswer}`);
          if (f.evaluation.modelAnswer) {
            lines.push(`  -> 교정 답변: ${f.evaluation.modelAnswer}`);
          }
        }
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

function InterviewContent({
  kakaoChannelUrl,
}: {
  kakaoChannelUrl?: string | null;
}) {
  const [resumeText, setResumeText] = useState("");
  const [jobCategory, setJobCategory] = useState(
    DEFAULT_INTERVIEW_JOB_CATEGORY
  );
  const [customerEmail, setCustomerEmail] = useState("");
  const [agreedToRefundPolicy, setAgreedToRefundPolicy] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [session, setSession] = useState<InterviewSessionRecord | null>(null);
  const [resultText, setResultText] = useState("");
  const [error, setError] = useState("");
  const [refundNotice, setRefundNotice] = useState("");
  const [refundPendingNotice, setRefundPendingNotice] = useState("");
  const [activeOrder, setActiveOrder] = useState<{
    orderId: string;
    remainingGenerations: number;
  } | null>(null);
  const [paidResultInfo, setPaidResultInfo] = useState<PaidResultInfo | null>(
    null
  );
  const [isWidgetReady, setIsWidgetReady] = useState(false);
  const [upgradeContext, setUpgradeContext] = useState<{
    eligible: boolean;
    baseOrderId: string;
    baseResultToken: string | null;
    resumeExpired: boolean;
  } | null>(null);
  const [contextNotice, setContextNotice] = useState("");
  const [contextError, setContextError] = useState("");

  const [paymentState, setPaymentState] = useState<
    "idle" | "processing" | "timeout" | "error"
  >("idle");
  const [paymentTimeoutMsg, setPaymentTimeoutMsg] = useState("");

  const paymentWidgetRef = useRef<PaymentWidgetInstance | null>(null);
  const paymentMethodsWidgetRef = useRef<any>(null);
  const timeoutTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isWidgetReadyRef = useRef(false);

  const currentPrice = upgradeContext?.eligible
    ? PRICING_PLANS.interview_upgrade.price
    : PRICE;
  const currentPriceDisplay = currentPrice.toLocaleString("ko-KR");

  useEffect(() => {
    isWidgetReadyRef.current = isWidgetReady;
    if (isWidgetReady && paymentMethodsWidgetRef.current?.updateAmount) {
      try {
        paymentMethodsWidgetRef.current.updateAmount(currentPrice);
      } catch (err) {
        console.warn("면접 결제 위젯 금액 갱신 실패:", err);
      }
    }
  }, [isWidgetReady, currentPrice]);

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
      paymentWidget.renderAgreement("#interview-agreement", {
        variantKey: "AGREEMENT",
      });
      paymentMethodsWidget.on("ready", () => {
        setIsWidgetReady(true);
        isWidgetReadyRef.current = true;
      });
      paymentMethodsWidgetRef.current = paymentMethodsWidget;
    } catch (err: any) {
      console.error("결제 위젯 초기화 실패:", err);
      setPaymentState("error");
      setError(
        "결제 모듈을 불러오지 못했습니다. 네트워크를 확인 후 다시 시도해 주세요."
      );
    }
  };

  const restoreSessionFromServer = async (params: {
    sessionId?: string;
    orderId?: string;
    token?: string;
  }) => {
    try {
      const qs = new URLSearchParams();
      if (params.orderId) qs.set("orderId", params.orderId);
      if (params.token) qs.set("token", params.token);
      if (params.sessionId) qs.set("sessionId", params.sessionId);

      const res = await fetch(`/api/interview/session?${qs.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (!data?.session) return false;

      const restored: InterviewSessionRecord = data.session;
      setSession(restored);
      if (restored.resumeText) {
        setResumeText(restored.resumeText);
        localStorage.setItem("interviewResumeDraft", restored.resumeText);
      }
      if (restored.jobCategory) {
        setJobCategory(restored.jobCategory);
      }
      setResultText(buildClientNoteSummaryText(restored));

      if (!restored.isFree && data.order && params.token) {
        setPaidResultInfo({
          orderId: data.order.orderId,
          resultUrl: data.order.resultUrl,
          resultToken: params.token,
          expiresAt: data.order.resultExpiresAt ?? restored.expiresAt ?? null,
          remainingGenerations: data.order.remainingGenerations ?? 0,
          receiptUrl: data.order.receiptUrl ?? null,
          emailSent: false,
        });
        setActiveOrder(null);
        localStorage.setItem(
          ACTIVE_SESSION_STORAGE_KEY,
          JSON.stringify({
            sessionId: restored.sessionId,
            orderId: data.order.orderId,
            resultToken: params.token,
          })
        );
      }

      setTimeout(() => {
        document
          .getElementById("simulator-section")
          ?.scrollIntoView({ behavior: "smooth" });
      }, 120);
      return true;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    const savedEmail = localStorage.getItem("lastCustomerEmail");
    if (savedEmail) {
      setCustomerEmail(savedEmail);
    }

    const savedJob = localStorage.getItem("interviewJobCategory");
    if (
      savedJob &&
      INTERVIEW_JOB_CATEGORIES.some((item) => item.value === savedJob)
    ) {
      setJobCategory(savedJob);
    }

    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get("token");
    const successOrderId = urlParams.get("orderId");
    const resumeSessionId = urlParams.get("sessionId");
    const upgradeFrom = urlParams.get("upgradeFrom");
    const bundleFrom = urlParams.get("bundleFrom");

    const fetchDraft = async (t: string) => {
      try {
        const res = await fetch(`/api/interview/draft?token=${t}`);
        if (res.ok) {
          const data = await res.json();
          setResumeText(data.resumeText);
          localStorage.setItem("interviewResumeDraft", data.resumeText);
        } else {
          setError(
            "자소서 원문을 불러오지 못했거나 토큰이 만료되었습니다. 직접 입력해 주세요."
          );
        }
      } catch {
        setError("네트워크 오류로 자소서를 불러오지 못했습니다. 직접 입력해 주세요.");
      }
      urlParams.delete("token");
      window.history.replaceState(
        {},
        document.title,
        window.location.pathname +
          (urlParams.toString() ? `?${urlParams.toString()}` : "")
      );
    };

    const bootstrap = async () => {
      // 0a) 자소서 구매자 +3,000원 업그레이드 진입 (/interview?upgradeFrom=...&token=...)
      if (upgradeFrom) {
        try {
          const qs = new URLSearchParams({ upgradeFrom });
          if (token) qs.set("token", token);
          const ctxRes = await fetch(`/api/interview/context?${qs.toString()}`, {
            cache: "no-store",
          });
          const ctxData = await ctxRes.json().catch(() => null);
          if (ctxRes.ok && ctxData?.eligible) {
            setUpgradeContext({
              eligible: true,
              baseOrderId: ctxData.baseOrderId,
              baseResultToken: token || null,
              resumeExpired: Boolean(ctxData.resumeExpired),
            });
            if (ctxData.jobCategory) {
              setJobCategory(ctxData.jobCategory);
              localStorage.setItem("interviewJobCategory", ctxData.jobCategory);
            }
            if (ctxData.resumeText) {
              setResumeText(ctxData.resumeText);
              localStorage.setItem("interviewResumeDraft", ctxData.resumeText);
            }
            setContextNotice(
              ctxData.resumeExpired
                ? "자소서 결과 보관 기간(7일)이 지나 자소서 원문을 다시 입력해 주세요. +3,000원 업그레이드 할인 자격은 유지됩니다."
                : `기존 자소서 구매자 전용 +3,000원 업그레이드 할인이 적용되었습니다 (주문 ${ctxData.baseOrderId}). 자소서 원문을 자동으로 불러왔습니다.`
            );
          } else {
            setContextError(
              ctxData?.message ||
                "업그레이드 할인 자격을 확인할 수 없어 기본 요금(4,900원)이 적용됩니다."
            );
          }
        } catch {
          setContextError(
            "업그레이드 정보를 불러오지 못해 기본 요금(4,900원)이 적용됩니다."
          );
        }
        urlParams.delete("upgradeFrom");
        urlParams.delete("token");
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
      }

      // 0b) 7,900원 통합 패키지 진입 (/interview?orderId=int_...&bundleFrom=...&token=...)
      if (bundleFrom) {
        try {
          const qs = new URLSearchParams({ bundleFrom });
          if (token) qs.set("token", token);
          const ctxRes = await fetch(`/api/interview/context?${qs.toString()}`, {
            cache: "no-store",
          });
          const ctxData = await ctxRes.json().catch(() => null);
          if (ctxRes.ok && ctxData?.eligible && ctxData.linkedInterviewOrderId) {
            const linkedOrderId = ctxData.linkedInterviewOrderId as string;
            const resolvedCategory =
              ctxData.jobCategory || savedJob || DEFAULT_INTERVIEW_JOB_CATEGORY;
            setActiveOrder({
              orderId: linkedOrderId,
              remainingGenerations: ctxData.remainingGenerations ?? PAID_INTERVIEW_GENERATIONS,
            });
            setJobCategory(resolvedCategory);
            localStorage.setItem("interviewJobCategory", resolvedCategory);
            if (ctxData.resumeText) {
              setResumeText(ctxData.resumeText);
              localStorage.setItem("interviewResumeDraft", ctxData.resumeText);
            }
            urlParams.delete("bundleFrom");
            urlParams.delete("orderId");
            urlParams.delete("token");
            window.history.replaceState({}, document.title, window.location.pathname);

            if ((ctxData.remainingGenerations ?? 0) > 0 && ctxData.resumeText) {
              setContextNotice(
                "7,900원 통합 패키지에 포함된 AI 면접 시뮬레이터(15문항·45회)를 즉시 시작합니다."
              );
              await handleGenerate(linkedOrderId, ctxData.resumeText, resolvedCategory);
            } else {
              setContextNotice(
                ctxData.resumeExpired
                  ? "결과 보관 기간(7일)이 지나 자소서 원문을 다시 입력한 뒤 위 보유 이용권 버튼으로 면접을 시작해 주세요."
                  : "통합 패키지 연동 이용권이 연결되었습니다. 아래 버튼으로 모의면접을 시작하세요."
              );
            }
            return;
          }
        } catch {
          // fall through to standard bootstrap
        }
      }

      // 1) /result/[orderId]?token=... 에서 "이어서 모의면접 연습하기"로 복귀한 경우
      if (successOrderId && token) {
        const ok = await restoreSessionFromServer({
          orderId: successOrderId,
          token,
          sessionId: resumeSessionId || undefined,
        });
        urlParams.delete("token");
        urlParams.delete("orderId");
        urlParams.delete("sessionId");
        window.history.replaceState({}, document.title, window.location.pathname);
        if (ok) return;
      }

      // 2) 자소서 화면에서 전달된 임시 draft token
      if (token && !successOrderId) {
        await fetchDraft(token);
      } else {
        const savedDraft = localStorage.getItem("interviewResumeDraft");
        if (savedDraft) {
          setResumeText(savedDraft);
        }
      }

      // 3) 결제 성공 직후 redirect (/interview?orderId=...)
      if (successOrderId && !token) {
        setActiveOrder({
          orderId: successOrderId,
          remainingGenerations: PAID_INTERVIEW_GENERATIONS,
        });
        urlParams.delete("orderId");
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname +
            (urlParams.toString() ? `?${urlParams.toString()}` : "")
        );
        const savedDraft = localStorage.getItem("interviewResumeDraft");
        if (savedDraft) {
          await handleGenerate(successOrderId, savedDraft, savedJob || DEFAULT_INTERVIEW_JOB_CATEGORY);
        }
        return;
      }

      // 4) 기존 진행 중이던 로컬 저장 세션 자동 복구 (새로고침 유지)
      const savedSessionRaw = localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
      if (savedSessionRaw && !token) {
        try {
          const parsed = JSON.parse(savedSessionRaw) as {
            sessionId?: string;
            orderId?: string;
            resultToken?: string;
          };
          if (parsed.orderId && parsed.resultToken) {
            await restoreSessionFromServer({
              orderId: parsed.orderId,
              token: parsed.resultToken,
              sessionId: parsed.sessionId,
            });
          } else if (parsed.sessionId) {
            await restoreSessionFromServer({ sessionId: parsed.sessionId });
          }
        } catch {
          localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
        }
      }
    };

    bootstrap();
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

  const handleJobCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setJobCategory(e.target.value);
    localStorage.setItem("interviewJobCategory", e.target.value);
  };

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
      setError(
        "7일 면접 대비 노트 재열람 링크 및 영수증 안내를 받을 올바른 이메일 주소를 입력해 주세요."
      );
      return;
    }

    try {
      const orderId = "int_" + Math.random().toString(36).substring(2, 11);
      const isUpgrade = Boolean(upgradeContext?.eligible && upgradeContext.baseOrderId);
      const selectedPlanType = isUpgrade ? "interview_upgrade" : "interview_single";

      localStorage.setItem("lastCustomerEmail", cleanEmail);
      localStorage.setItem(`orderEmail:${orderId}`, cleanEmail);
      localStorage.setItem("interviewJobCategory", jobCategory);
      localStorage.setItem(
        `paymentCheckoutMeta:${orderId}`,
        JSON.stringify({
          planType: selectedPlanType,
          ...(isUpgrade
            ? {
                baseOrderId: upgradeContext!.baseOrderId,
                baseResultToken: upgradeContext!.baseResultToken,
              }
            : {}),
        })
      );

      // 결제창 호출 직전 서버 의도 등록 (+3,000원 업그레이드인 경우 자격·1회 제한 사전 검증)
      const prepareRes = await fetch("/api/payments/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          planType: selectedPlanType,
          email: cleanEmail,
          ...(isUpgrade
            ? {
                baseOrderId: upgradeContext!.baseOrderId,
                baseResultToken: upgradeContext!.baseResultToken,
              }
            : {}),
        }),
      });
      if (!prepareRes.ok) {
        const prepErr = await prepareRes.json().catch(() => null);
        setPaymentState("idle");
        setError(
          prepErr?.error || "결제 준비 검증에 실패했습니다. 주문 상태를 확인해 주세요."
        );
        return;
      }

      await paymentWidget.requestPayment({
        orderId,
        orderName: isUpgrade
          ? PRICING_PLANS.interview_upgrade.label
          : PRICING_PLANS.interview_single.label,
        customerEmail: cleanEmail,
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
    setRefundNotice("");
    setRefundPendingNotice("");
    setPaymentTimeoutMsg("");

    if (!resumeText.trim() || resumeText.trim().length < 50) {
      setError("자기소개서 본문을 최소 50자 이상 입력한 뒤 결제를 진행해 주세요.");
      const el = document.getElementById("interview-textarea");
      if (el) el.focus();
      return;
    }

    const cleanEmail = normalizeEmail(customerEmail);
    if (!cleanEmail) {
      setError(
        "7일 면접 대비 노트 재열람 링크 및 영수증 안내를 받을 올바른 이메일 주소를 입력해 주세요."
      );
      const emailEl = document.getElementById("interview-customer-email");
      if (emailEl) emailEl.focus();
      return;
    }

    if (!agreedToRefundPolicy) {
      setError("결제 진행을 위해 환불 정책에 동의해 주세요.");
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

  const handleGenerate = async (
    paidOrderId?: string,
    textOverride?: string,
    categoryOverride?: string
  ) => {
    const textToUse = (textOverride ?? resumeText).trim();
    const categoryToUse = (categoryOverride ?? jobCategory).trim();

    if (!textToUse || textToUse.length < 50) {
      setError("자기소개서 내용을 최소 50자 이상 입력해 주세요.");
      const el = document.getElementById("interview-textarea");
      if (el) el.focus();
      return;
    }

    setIsGenerating(true);
    setError("");
    setRefundNotice("");
    setRefundPendingNotice("");

    setTimeout(() => {
      document
        .getElementById("generation-progress-banner")
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 50);

    try {
      const cleanEmail = normalizeEmail(customerEmail);
      const payload: Record<string, any> = {
        jobCategory: categoryToUse || DEFAULT_INTERVIEW_JOB_CATEGORY,
        resumeText: textToUse,
        isFree: !paidOrderId,
      };

      if (paidOrderId) {
        payload.orderId = paidOrderId;
        if (cleanEmail) {
          payload.email = cleanEmail;
        }
      }

      const res = await fetch("/api/interview/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);

        if (errData?.refunded || errData?.code === "AUTO_REFUNDED") {
          const msg =
            errData?.error || "생성 오류로 결제가 자동 전액 환불되었습니다";
          setRefundNotice(msg);
          setActiveOrder(null);
          throw new Error(msg);
        }

        if (
          errData?.refundPending ||
          errData?.code === "REFUND_PENDING" ||
          errData?.order?.status === "refund_failed" ||
          res.status === 502
        ) {
          const msg =
            errData?.error ||
            "환불 처리 중입니다(영업일 기준 1~2일 내 처리). 지연 시 고객센터로 문의해 주세요.";
          setRefundPendingNotice(msg);
          setActiveOrder(null);
          throw new Error(msg);
        }

        if (errData?.code === "GENERATION_RETRY_ALLOWED") {
          throw new Error(
            errData?.error ||
              "일시적인 생성 오류로 실패했습니다. 결제 횟수는 차감되지 않았으니 잠시 후 다시 시도해 주세요."
          );
        }

        if (res.status === 429) {
          throw new Error(freeLimitExceededMessage("interview"));
        }
        if (res.status === 409) {
          throw new Error(
            errData?.error || "이미 AI 생성이 진행 중입니다. 잠시만 기다려 주세요."
          );
        }
        if (res.status === 403) {
          setActiveOrder(null);
          throw new Error(
            errData?.error || "결제 정보가 유효하지 않거나 이용권을 모두 소진했습니다."
          );
        }
        throw new Error(
          errData?.error || "생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."
        );
      }

      const data = await res.json();

      const newSession: InterviewSessionRecord = {
        sessionId: data.sessionId,
        orderId: data.order?.orderId ?? null,
        isFree: Boolean(data.isFree),
        jobCategory: data.jobCategory || categoryToUse,
        resumeText: textToUse,
        questions: data.questions || [],
        threads: {},
        maxEvaluations: data.maxEvaluations,
        usedEvaluations: data.usedEvaluations ?? 0,
        remainingEvaluations: data.remainingEvaluations,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: data.expiresAt,
      };

      setSession(newSession);
      setResultText(data.text || buildClientNoteSummaryText(newSession));

      if (data.order) {
        setActiveOrder(null);
        setUpgradeContext(null);
        setContextNotice("");
        if (data.order.resultUrl && data.resultToken) {
          setPaidResultInfo({
            orderId: data.order.orderId,
            resultUrl: data.order.resultUrl,
            resultToken: data.resultToken,
            expiresAt: data.order.resultExpiresAt ?? null,
            remainingGenerations: data.order.remainingGenerations ?? 0,
            receiptUrl: data.order.receiptUrl ?? null,
            emailSent: Boolean(data.order.emailSent),
          });
          localStorage.setItem(
            ACTIVE_SESSION_STORAGE_KEY,
            JSON.stringify({
              sessionId: newSession.sessionId,
              orderId: data.order.orderId,
              resultToken: data.resultToken,
            })
          );
        }
      } else {
        setPaidResultInfo(null);
        localStorage.setItem(
          ACTIVE_SESSION_STORAGE_KEY,
          JSON.stringify({ sessionId: newSession.sessionId })
        );
      }

      setTimeout(() => {
        document
          .getElementById("simulator-section")
          ?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } catch (err: any) {
      setError(err.message || "오류가 발생했습니다.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSessionUpdate = (updated: InterviewSessionRecord) => {
    setSession(updated);
    setResultText(buildClientNoteSummaryText(updated));
  };

  const scrollToPayment = () => {
    document
      .getElementById("interview-payment-anchor")
      ?.scrollIntoView({ behavior: "smooth" });
  };

  const interviewComparisonBox = (
    <div className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50/70">
      <div className="px-4 py-2.5 bg-white border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-xs sm:text-sm font-extrabold text-gray-900">
          무료 체험(일 1회) vs 유료 시뮬레이터({currentPriceDisplay}원) 비교
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-100/70 text-gray-600">
              <th className="py-2 px-3 font-bold w-[26%]">항목</th>
              <th className="py-2 px-3 font-bold w-[34%]">무료 체험 (0원)</th>
              <th className="py-2 px-3 font-extrabold text-blue-700 bg-blue-50/70 w-[40%]">
                실전 시뮬레이터 ({currentPriceDisplay}원)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200/80 bg-white">
            <tr>
              <td className="py-2 px-3 font-bold text-gray-800">예상 질문 수</td>
              <td className="py-2 px-3 text-gray-500">3문항 (NCS 태그)</td>
              <td className="py-2 px-3 font-semibold bg-blue-50/30">
                총 15문항 (직무 10 + 공공기관 인성 5)
              </td>
            </tr>
            <tr>
              <td className="py-2 px-3 font-bold text-gray-800">답변 채점 · 모범답변</td>
              <td className="py-2 px-3 text-gray-500">
                1문항 채점 (모범답변 잠금)
              </td>
              <td className="py-2 px-3 font-semibold bg-blue-50/30">
                최대 {INTERVIEW_MAX_EVALUATIONS}회 채점 · 모범답변 공개
              </td>
            </tr>
            <tr>
              <td className="py-2 px-3 font-bold text-gray-800">꼬리질문 연쇄</td>
              <td className="py-2 px-3 text-gray-500">1단계 질문 미리보기만</td>
              <td className="py-2 px-3 font-semibold bg-blue-50/30">
                직전 약점 기반 1→2→3단계 연쇄 답변
              </td>
            </tr>
            <tr>
              <td className="py-2 px-3 font-bold text-gray-800">보관 · 대비 노트</td>
              <td className="py-2 px-3 text-gray-500">세션 2시간 임시 보관</td>
              <td className="py-2 px-3 font-semibold bg-blue-50/30">
                면접 대비 노트 7일 자동저장 + 이어하기 + .txt
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <main className="flex-1 min-h-screen bg-gray-50 py-8 sm:py-12 px-4 sm:px-6 lg:px-8 text-gray-900">
      <div className="max-w-6xl mx-auto flex flex-col gap-10">
        {/* [2단 메인 히어로 섹션] */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10 items-start">
          <div className="flex flex-col gap-6">
            <div className="inline-flex items-center gap-1.5 self-start px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-700">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              NCS 10대 직업기초능력 · 일관성 교차 검증
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900 tracking-tight leading-tight">
                공공기관 AI 면접 시뮬레이터
              </h1>
              <p className="mt-3 text-sm sm:text-base text-gray-600 leading-relaxed break-keep">
                제출한 자소서를 바탕으로{" "}
                <strong className="text-gray-900">
                  공공기관 면접관 관점(NCS 직업기초능력·공직가치 중심)
                </strong>
                에서 직무 10문항·인성 5문항을 출제하고, 답변 100점 루브릭 채점·자소서 일관성 대조·동적 3단계 압박 꼬리질문을 제공합니다.
              </p>
            </div>

            <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-gray-200 flex flex-col gap-3">
              {contextNotice && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 font-semibold leading-relaxed">
                  {contextNotice}
                </div>
              )}
              {contextError && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 font-semibold leading-relaxed">
                  {contextError}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="interview-textarea"
                  className="block text-sm font-bold text-gray-900"
                >
                  자기소개서 본문 입력 <span className="text-blue-600">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setResumeText(INTERVIEW_SAMPLE_RESUME);
                      localStorage.setItem(
                        "interviewResumeDraft",
                        INTERVIEW_SAMPLE_RESUME
                      );
                      setError("");
                    }}
                    className="text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-md border border-blue-200 cursor-pointer"
                  >
                    공공기관 샘플 채우기
                  </button>
                  <span className="text-xs text-gray-400 font-medium">
                    {resumeText.length} / 4000자
                  </span>
                </div>
              </div>
              <p className="text-xs text-gray-500 break-keep">
                면접에서 검증받고 싶은 자소서 본문 또는 직무 경험 내용을 붙여넣어 주세요.
                <br />
                <span className="text-red-600 font-semibold">
                  주민번호·연락처 등 민감한 개인정보는 입력하지 마세요.
                </span>
              </p>
              <textarea
                id="interview-textarea"
                rows={6}
                value={resumeText}
                onChange={handleResumeTextChange}
                maxLength={4000}
                placeholder="예: OO공단 행정 인턴 기간 중 부서 계약·지출 결의 증빙 체크리스트 12개 항목을 표준화하여 서류 보완 요청 건수를 줄이고 기한 내 처리율을 높였습니다."
                className="w-full p-3.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-sm text-gray-800 leading-relaxed resize-y min-h-[140px]"
              />

              <div className="pt-2 border-t border-gray-100 flex flex-col gap-1.5">
                <label
                  htmlFor="job-category-select"
                  className="text-xs font-bold text-gray-700"
                >
                  면접관 전문 분야 (공공기관 NCS · 직군 선택)
                </label>
                <select
                  id="job-category-select"
                  value={jobCategory}
                  onChange={handleJobCategoryChange}
                  className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm font-medium text-gray-800 cursor-pointer"
                >
                  {INTERVIEW_JOB_CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div id="interview-payment-anchor" className="scroll-mt-20">
              <PaymentSection
                priceDisplay={currentPriceDisplay}
                title={
                  upgradeContext?.eligible
                    ? `자소서 구매자 면접 업그레이드 (${currentPriceDisplay}원)`
                    : `면접 시뮬레이터 결제 및 시작 (${currentPriceDisplay}원)`
                }
                subTitle={`직무 10 + 공공기관 인성 5 = 총 15문항 · 최대 ${INTERVIEW_MAX_EVALUATIONS}회 답변 채점·꼬리질문 · 대비 노트 7일 보관`}
                badgeText={
                  upgradeContext?.eligible
                    ? "1,900원 할인 · 업그레이드"
                    : "1회 이용권"
                }
                customerEmail={customerEmail}
                onCustomerEmailChange={(v) => {
                  setCustomerEmail(v);
                  if (error) setError("");
                }}
                emailInputId="interview-customer-email"
                agreedToRefundPolicy={agreedToRefundPolicy}
                onAgreedChange={setAgreedToRefundPolicy}
                refundCheckboxId="interview-refund-agree"
                guaranteeBenefitText={PAID_INTERVIEW_BENEFIT_TEXT}
                error={error}
                refundNotice={refundNotice}
                refundPendingNotice={refundPendingNotice}
                activeOrder={activeOrder}
                onUseActiveOrder={() =>
                  activeOrder && handleGenerate(activeOrder.orderId)
                }
                paymentState={paymentState}
                paymentTimeoutMsg={paymentTimeoutMsg}
                onRetryPayment={handleRetryPayment}
                onPaymentClick={handlePaymentClick}
                paidButtonText={
                  upgradeContext?.eligible
                    ? `+${currentPriceDisplay}원 업그레이드하고 15문항 시작`
                    : `${currentPriceDisplay}원 결제하고 15문항 시뮬레이터 시작`
                }
                paidButtonSubText={PAID_INTERVIEW_BREAKDOWN}
                processingText="결제창을 준비하고 있습니다..."
                isGenerating={isGenerating}
                onFreeGenerate={() => handleGenerate()}
                freeButtonText={`먼저 무료로 면접 체험하기 (일 ${FREE_LIMITS.interview}회 · 질문 3개+1문항 채점)`}
                generatingText="NCS 예상 면접 질문 15선 구성 중..."
                generatingBannerText="공공기관 면접관 관점에서 자소서 기반 직무·인성 질문 세트를 생성하고 있습니다 (약 10~20초)"
                widgetContainerId="interview-payment-widget"
                agreementContainerId="interview-agreement"
                kakaoChannelUrl={kakaoChannelUrl}
                comparisonTable={interviewComparisonBox}
              />
            </div>
          </div>

          <div className="w-full">
            <InterviewPreviewCard />
          </div>
        </section>

        {/* [면접 시뮬레이터 실행 결과 섹션] */}
        {session && (
          <section
            id="simulator-section"
            className="scroll-mt-20 space-y-6 animate-fadeIn"
          >
            {paidResultInfo && (
              <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-gray-200 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base sm:text-lg font-extrabold text-gray-900">
                    면접 대비 노트 (질문·내 답변·교정 답변·꼬리질문·일관성 자동 저장)
                  </h2>
                  <button
                    type="button"
                    onClick={() =>
                      downloadTextFile(
                        `면접대비노트_${paidResultInfo.orderId}.txt`,
                        resultText
                      )
                    }
                    className="text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg border border-blue-200 cursor-pointer"
                  >
                    대비 노트 .txt 다운로드
                  </button>
                </div>

                <PaidResultShareCard
                  orderId={paidResultInfo.orderId}
                  serviceType="interview"
                  resultText={resultText}
                  resultUrl={paidResultInfo.resultUrl}
                  expiresAt={paidResultInfo.expiresAt}
                  receiptUrl={paidResultInfo.receiptUrl}
                  remainingGenerations={paidResultInfo.remainingGenerations}
                  emailSent={paidResultInfo.emailSent}
                  kakaoChannelUrl={kakaoChannelUrl}
                />
              </div>
            )}

            <InterviewSimulatorWorkspace
              session={session}
              onSessionUpdate={handleSessionUpdate}
              onUnlockClick={session.isFree ? scrollToPayment : undefined}
            />
          </section>
        )}

        <FAQAccordion />
      </div>
    </main>
  );
}

export default function InterviewPage({
  kakaoChannelUrl,
}: {
  kakaoChannelUrl?: string | null;
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
          로딩 중...
        </div>
      }
    >
      <InterviewContent kakaoChannelUrl={kakaoChannelUrl} />
    </Suspense>
  );
}
