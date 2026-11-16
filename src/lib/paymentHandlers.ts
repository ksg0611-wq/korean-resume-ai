import { NextResponse } from "next/server";
import type { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_CONFIG, generateContentWithFallback } from "@/lib/gemini";
import { reportServerError, sanitizeErrorText } from "@/lib/alerts";
import { confirmTossPayment, cancelTossPayment } from "@/lib/toss";
import { sendResultEmail } from "@/lib/email";
import {
  beginPaidGeneration,
  completePaidGeneration,
  consumePreviewForOrder,
  getPaymentIntent,
  getStoredResultForOrder,
  handlePaidGenerationFailure,
  releaseOrderReservationWithoutDeduction,
  saveConfirmedOrder,
  validateInterviewUpgradeEligibility,
} from "@/lib/orders";
import {
  formatFullPackageText,
  generateFourQuestionsResume,
  generateTenInterviewQuestions,
} from "@/lib/packageGenerator";
import { normalizeEmail, PRICING_PLANS } from "@/lib/policy";
import type { InterviewQuestionItem, PlanType, ServiceType } from "@/lib/results";
import { BUSINESS_INFO } from "@/lib/siteConfig";
import { isPaymentLockedForRequest } from "@/lib/adminAuth";

/**
 * 토스 결제 승인 공통 라우트 핸들러 (/api/payments/success, /api/interview/payment 공용)
 */
export async function handleConfirmPaymentRequest(
  req: Request,
  options: {
    serviceType: ServiceType;
    routePath: string;
    allowedAmounts?: number[];
  }
): Promise<NextResponse> {
  if (isPaymentLockedForRequest(req)) {
    return NextResponse.json(
      {
        error: "결제 서비스 준비 중입니다.",
        message: "결제 서비스 준비 중입니다.",
        code: "TEST_PAYMENT_LOCKED",
      },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  const { serviceType, routePath, allowedAmounts } = options;
  let orderIdForLog: string | null = null;

  try {
    const body = await req.json();
    const {
      paymentKey,
      orderId,
      amount,
      email,
      planType: bodyPlanType,
      baseOrderId: bodyBaseOrderId,
      baseResultToken: bodyBaseResultToken,
    } = body || {};
    orderIdForLog = typeof orderId === "string" ? orderId : null;

    if (!paymentKey || !orderId || amount === undefined || amount === null) {
      return NextResponse.json({ message: "Bad Request" }, { status: 400 });
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return NextResponse.json(
        { message: "결제 금액이 유효하지 않습니다." },
        { status: 400 }
      );
    }

    if (allowedAmounts && allowedAmounts.length > 0 && !allowedAmounts.includes(numericAmount)) {
      return NextResponse.json(
        {
          message: `허용되지 않은 결제 금액(${numericAmount}원)입니다.`,
          code: "INVALID_PAYMENT_AMOUNT",
        },
        { status: 403 }
      );
    }

    // 결제 준비 단계 의도(payment_intent:{orderId}) 조회 및 가격·업그레이드 자격 선검증
    const intent = await getPaymentIntent(String(orderId));
    if (intent && intent.expectedAmount !== numericAmount) {
      return NextResponse.json(
        {
          message: `주문 금액(${intent.expectedAmount}원)과 요청 금액(${numericAmount}원)이 일치하지 않습니다.`,
          code: "PAYMENT_INTENT_MISMATCH",
        },
        { status: 403 }
      );
    }

    const cleanBodyBaseOrderId =
      typeof bodyBaseOrderId === "string" ? bodyBaseOrderId.trim() : "";
    const cleanBodyBaseToken =
      typeof bodyBaseResultToken === "string" ? bodyBaseResultToken.trim() : "";
    const effectiveBaseOrderId = intent?.baseOrderId || cleanBodyBaseOrderId || null;
    const effectiveBaseToken = cleanBodyBaseToken || intent?.baseResultToken || null;
    const cleanEmailHint = normalizeEmail(email) || intent?.email || null;

    const isUpgradeAttempt =
      serviceType === "interview" &&
      (numericAmount === PRICING_PLANS.interview_upgrade.price ||
        intent?.planType === "interview_upgrade" ||
        bodyPlanType === "interview_upgrade");

    if (isUpgradeAttempt) {
      if (numericAmount !== PRICING_PLANS.interview_upgrade.price) {
        return NextResponse.json(
          {
            message: "업그레이드 결제 금액이 올바르지 않습니다.",
            code: "INVALID_UPGRADE_AMOUNT",
          },
          { status: 403 }
        );
      }
      const eligibility = await validateInterviewUpgradeEligibility({
        baseOrderId: effectiveBaseOrderId || "",
        baseResultToken: effectiveBaseToken,
        email: cleanEmailHint,
      });
      if (!eligibility.eligible) {
        return NextResponse.json(
          {
            message: eligibility.message,
            code: eligibility.code,
          },
          { status: 403 }
        );
      }
    }

    const confirmResult = await confirmTossPayment({
      paymentKey,
      orderId,
      amount,
      route: routePath,
    });

    if (!confirmResult.ok) {
      return NextResponse.json(
        { message: confirmResult.errorMessage || "결제 승인 실패", tossError: confirmResult.data },
        { status: confirmResult.status }
      );
    }

    const paymentData = confirmResult.data;
    const confirmedAmount =
      typeof paymentData?.totalAmount === "number"
        ? paymentData.totalAmount
        : numericAmount;

    const confirmedMatchesRequested = confirmedAmount === numericAmount;
    const confirmedMatchesIntent = !intent || confirmedAmount === intent.expectedAmount;
    const confirmedAllowed =
      !allowedAmounts || allowedAmounts.length === 0 || allowedAmounts.includes(confirmedAmount);

    let postConfirmUpgradeOk = true;
    if (
      serviceType === "interview" &&
      confirmedAmount === PRICING_PLANS.interview_upgrade.price
    ) {
      const recheck = await validateInterviewUpgradeEligibility({
        baseOrderId: effectiveBaseOrderId || "",
        baseResultToken: effectiveBaseToken,
        email:
          normalizeEmail(email) ||
          normalizeEmail(paymentData?.customerEmail) ||
          intent?.email ||
          null,
      });
      postConfirmUpgradeOk = recheck.eligible;
    }

    if (
      !confirmedMatchesRequested ||
      !confirmedMatchesIntent ||
      !confirmedAllowed ||
      !postConfirmUpgradeOk
    ) {
      await cancelTossPayment({
        paymentKey,
        cancelReason: `서버 검증 결제 금액·자격 불일치 자동 취소 (${confirmedAmount}원)`,
        orderId,
        route: routePath,
      });
      return NextResponse.json(
        {
          message: "결제 금액 또는 할인 자격 검증에 실패하여 자동 취소되었습니다.",
          code: "PAYMENT_AMOUNT_MISMATCH",
        },
        { status: 403 }
      );
    }

    const resolvedEmail =
      normalizeEmail(email) || normalizeEmail(paymentData?.customerEmail) || intent?.email || null;

    const inferredPlanType: PlanType =
      serviceType === "interview"
        ? confirmedAmount === PRICING_PLANS.interview_upgrade.price
          ? "interview_upgrade"
          : "interview_single"
        : confirmedAmount === PRICING_PLANS.bundle.price
          ? "bundle"
          : "resume_single";

    const { order, alreadyConfirmed } = await saveConfirmedOrder({
      orderId,
      serviceType,
      planType: inferredPlanType,
      paymentKey,
      amount: confirmedAmount,
      email: resolvedEmail,
      receiptUrl:
        typeof paymentData?.receipt?.url === "string"
          ? paymentData.receipt.url
          : null,
      baseOrderId:
        inferredPlanType === "interview_upgrade" ? effectiveBaseOrderId : null,
    });

    return NextResponse.json({
      success: true,
      alreadyConfirmed,
      payment: paymentData,
      order: {
        orderId: order.orderId,
        serviceType: order.serviceType,
        planType: order.planType,
        baseOrderId: order.baseOrderId ?? null,
        linkedInterviewOrderId: order.linkedInterviewOrderId ?? null,
        status: order.status,
        amount: order.amount,
        paidAt: order.paidAt,
        totalGenerations: order.totalGenerations,
        remainingGenerations: order.remainingGenerations,
      },
    });
  } catch (error) {
    console.error(`[${routePath}] Payment Confirm Route Error:`, error);
    await reportServerError({
      route: routePath,
      statusCode: 500,
      error,
      orderId: orderIdForLog,
      serviceType,
    });
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * 유료 생성 라이프사이클 공통 핸들러:
 * 1) 주문 검증 및 generating 상태 전이
 * 2) Gemini 22s 타임아웃 + 폴백 모델 1회 재시도 (총 45s 예산)
 * 3) 성공 시: 횟수 차감, 7일 재열람 링크 저장, Resend 이메일 발송
 * 4) 실패 시:
 *    - usedCount === 0: 토스 결제취소 API 자동 전액 환불 & 이용권 즉시 무효화(status: "refunded")
 *    - usedCount >= 1: 횟수 미차감 + 재시도 안내 반환
 */
export async function executePaidGeneration(options: {
  serviceType: ServiceType;
  routePath: string;
  orderId: string;
  genAI: GoogleGenerativeAI;
  prompt: string;
  resultTitle: string;
  optionalEmail?: string | null;
}): Promise<NextResponse> {
  const {
    serviceType,
    routePath,
    orderId,
    genAI,
    prompt,
    resultTitle,
    optionalEmail,
  } = options;

  const begin = await beginPaidGeneration({ orderId, serviceType });
  if (!begin.ok) {
    if (begin.code === "REFUND_PENDING") {
      return NextResponse.json(
        {
          error: begin.message,
          code: begin.code,
          refundPending: true,
          refunded: false,
          supportEmail: BUSINESS_INFO.email,
          kakaoChannelUrl: BUSINESS_INFO.kakaoChannelUrl,
        },
        { status: begin.status }
      );
    }
    return NextResponse.json(
      { error: begin.message, code: begin.code },
      { status: begin.status }
    );
  }

  const order = {
    ...begin.order,
    email: begin.order.email || normalizeEmail(optionalEmail),
  };

  try {
    const genResult = await generateContentWithFallback(
      genAI,
      prompt,
      GEMINI_CONFIG.WRITING_MODEL,
      GEMINI_CONFIG.THINKING_LEVEL
    );

    const completed = await completePaidGeneration({
      orderKey: begin.orderKey,
      order,
      title: resultTitle,
      text: genResult.text,
      usedModel: genResult.usedModel,
    });

    const emailOutcome = await sendResultEmail({
      to: completed.order.email,
      orderId: completed.order.orderId,
      serviceType,
      resultUrl: completed.resultUrl,
      expiresAt: completed.resultExpiresAt,
      receiptUrl: completed.order.receiptUrl ?? null,
    });

    return NextResponse.json({
      success: true,
      text: genResult.text,
      usedModel: genResult.usedModel,
      thinkingLevel: genResult.thinkingLevel,
      attempts: genResult.attempts,
      durationMs: genResult.durationMs,
      usage: genResult.usage,
      order: {
        orderId: completed.order.orderId,
        serviceType: completed.order.serviceType,
        planType: completed.order.planType ?? null,
        linkedInterviewOrderId: completed.order.linkedInterviewOrderId ?? null,
        status: completed.order.status,
        usedCount: completed.order.usedCount,
        remainingGenerations: completed.order.remainingGenerations,
        doneAt: completed.order.doneAt,
        resultUrl: completed.resultUrl,
        resultExpiresAt: completed.resultExpiresAt,
        receiptUrl: completed.order.receiptUrl ?? null,
        emailSent: emailOutcome.sent,
      },
    });
  } catch (genError) {
    await reportServerError({
      route: routePath,
      statusCode: 500,
      error: genError,
      orderId,
      serviceType,
      extra: {
        stage: "gemini_paid_generation",
        usedCount: order.usedCount ?? 0,
      },
    });

    const failure = await handlePaidGenerationFailure({
      orderKey: begin.orderKey,
      order,
      error: genError,
      route: routePath,
    });

    if (failure.outcome === "refunded") {
      return NextResponse.json(
        {
          error: "생성 오류로 결제가 자동 전액 환불되었습니다",
          code: "AUTO_REFUNDED",
          refunded: true,
          order: {
            orderId: failure.order.orderId,
            status: failure.order.status,
            paid: failure.order.paid,
            remainingGenerations: failure.order.remainingGenerations,
            refundedAt: failure.order.refundedAt,
            refundAmount: failure.order.refundAmount,
            refundTransactionKey: failure.order.refundTransactionKey,
            refundReason: failure.order.refundReason,
          },
          tossCancel: failure.cancelResult.data
            ? {
                status: failure.cancelResult.data.status,
                orderId: failure.cancelResult.data.orderId,
                cancels: failure.cancelResult.data.cancels,
              }
            : null,
        },
        { status: 500 }
      );
    }

    if (failure.outcome === "refund_failed") {
      await reportServerError({
        route: routePath,
        statusCode: 502,
        error: `Critical: Paid generation failed AND automatic Toss refund failed (${failure.cancelResult.errorMessage || "unknown"})`,
        orderId,
        serviceType,
        extra: { stage: "refund_failed" },
      });

      return NextResponse.json(
        {
          error:
            "환불 처리 중입니다(영업일 기준 1~2일 내 처리). 지연 시 고객센터로 문의해 주세요.",
          refundPending: true,
          refunded: false,
          supportEmail: BUSINESS_INFO.email,
          kakaoChannelUrl: BUSINESS_INFO.kakaoChannelUrl,
          order: {
            orderId: failure.order.orderId,
            status: failure.order.status,
          },
        },
        { status: 502 }
      );
    }

    // retry_allowed (usedCount >= 1)
    return NextResponse.json(
      {
        error:
          "일시적인 생성 오류로 실패했습니다. 결제 횟수는 차감되지 않았으니 잠시 후 다시 시도해 주세요.",
        code: "GENERATION_RETRY_ALLOWED",
        refunded: false,
        order: {
          orderId: failure.order.orderId,
          status: failure.order.status,
          usedCount: failure.order.usedCount,
          remainingGenerations: failure.order.remainingGenerations,
        },
      },
      { status: 503 }
    );
  }
}

/**
 * P1.4 유료 패키지 생성·잠금해제 라이프사이클:
 * - Branch A (previewToken 또는 order_preview 매핑 존재): 1회 소비 후 4문항 본문 즉시 해제 + 10개 면접 질문 생성 (1/3회 차감)
 *   * 면접 질문 생성만 실패해도 전액 환불하지 않고 unlocked 4문항 먼저 저장 (interviewPending: true) -> 무료 1회 재시도 허용
 * - Branch B (진단 완성본 전환 또는 신규 유료 생성):
 *   * fromDiagnosis && 원문 누락 시 횟수 차감 전에 DIAGNOSIS_TEXT_MISSING(400) 반환
 *   * 4문항 완성본 + 10개 면접 질문 Promise.all 병렬 생성
 */
export async function executePaidPackageGeneration(options: {
  routePath: string;
  orderId: string;
  genAI: GoogleGenerativeAI;
  jobTitle: string;
  memo: string;
  previewToken?: string | null;
  fromDiagnosis?: boolean;
  diagnosticWeaknesses?: string[];
  optionalEmail?: string | null;
  forceFail?: boolean;
}): Promise<NextResponse> {
  const {
    routePath,
    orderId,
    genAI,
    jobTitle,
    memo,
    previewToken,
    fromDiagnosis,
    diagnosticWeaknesses,
    optionalEmail,
    forceFail = false,
  } = options;

  const cleanMemo = memo.trim();
  const cleanJobTitle = jobTitle.trim();

  // 진단 완성본 전환 시 원문 유실(브라우저 변경/저장소 초기화)이면 횟수 차감 전 복구 입력 요청
  if (fromDiagnosis && !cleanMemo) {
    return NextResponse.json(
      {
        error: "자소서 원문을 다시 붙여넣어 주세요.",
        code: "DIAGNOSIS_TEXT_MISSING",
      },
      { status: 400 }
    );
  }

  const begin = await beginPaidGeneration({ orderId, serviceType: "resume" });
  if (!begin.ok) {
    if (begin.code === "REFUND_PENDING") {
      return NextResponse.json(
        {
          error: begin.message,
          code: begin.code,
          refundPending: true,
          refunded: false,
          supportEmail: BUSINESS_INFO.email,
          kakaoChannelUrl: BUSINESS_INFO.kakaoChannelUrl,
        },
        { status: begin.status }
      );
    }
    return NextResponse.json(
      { error: begin.message, code: begin.code },
      { status: begin.status }
    );
  }

  const order = {
    ...begin.order,
    email: begin.order.email || normalizeEmail(optionalEmail),
  };

  try {
    if (forceFail) {
      throw new Error(
        "FORCED_TEST_FAILURE: Scenario 6 automated refund verification (admin double-locked)"
      );
    }

    // 1. Branch A 확인 (진단 교정 모드가 아닌 경우 1회성 previewToken 매핑 조회 및 소비)
    const consumedPreview = !fromDiagnosis
      ? await consumePreviewForOrder({ orderId, previewToken })
      : null;

    if (consumedPreview && Array.isArray(consumedPreview.items) && consumedPreview.items.length > 0) {
      const resolvedJobTitle = cleanJobTitle || consumedPreview.jobTitle || "";
      const resumeContext = consumedPreview.items
        .map((item) => `[${item.title}]\n${item.body}`)
        .join("\n\n");

      let interviewQuestions: InterviewQuestionItem[] = [];
      let interviewPending = false;
      let interviewError: string | null = null;
      let interviewModelUsed: string | null = null;

      try {
        const interviewRes = await generateTenInterviewQuestions({
          genAI,
          jobTitle: resolvedJobTitle,
          resumeContext,
        });
        interviewQuestions = interviewRes.questions;
        interviewModelUsed = interviewRes.usedModel;
      } catch (ivError) {
        interviewPending = true;
        interviewError = sanitizeErrorText(ivError);
        await reportServerError({
          route: routePath,
          statusCode: 500,
          error: ivError,
          orderId,
          serviceType: "resume",
          extra: {
            stage: "branch_a_interview_partial_failure",
            usedCount: order.usedCount ?? 0,
          },
        });
      }

      const fullText = formatFullPackageText({
        jobTitle: resolvedJobTitle,
        items: consumedPreview.items,
        interviewQuestions,
      });

      const resultTitle = resolvedJobTitle
        ? `[${resolvedJobTitle}] AI 자소서·면접 패키지 완성본`
        : "AI 자소서 4문항·면접 질문 10선 패키지";

      const completed = await completePaidGeneration({
        orderKey: begin.orderKey,
        order,
        title: resultTitle,
        text: fullText,
        usedModel:
          interviewModelUsed ||
          consumedPreview.usedModel ||
          GEMINI_CONFIG.WRITING_MODEL,
        items: consumedPreview.items,
        interviewQuestions,
        interviewPending,
        interviewError,
        jobTitle: resolvedJobTitle,
        sourceMemo: consumedPreview.memo || cleanMemo || null,
      });

      const emailOutcome = await sendResultEmail({
        to: completed.order.email,
        orderId: completed.order.orderId,
        serviceType: "resume",
        resultUrl: completed.resultUrl,
        expiresAt: completed.resultExpiresAt,
        receiptUrl: completed.order.receiptUrl ?? null,
      });

      return NextResponse.json({
        success: true,
        branch: "preview_unlock",
        partialFailure: interviewPending,
        interviewPending,
        text: fullText,
        items: consumedPreview.items,
        interviewQuestions,
        sourceMemo: consumedPreview.memo || cleanMemo || "",
        usedModel: completed.order.usedModel || GEMINI_CONFIG.WRITING_MODEL,
        thinkingLevel: consumedPreview.thinkingLevel || GEMINI_CONFIG.THINKING_LEVEL,
        resultToken: completed.resultUrl.split("token=")[1] || "",
        order: {
          orderId: completed.order.orderId,
          serviceType: completed.order.serviceType,
          planType: completed.order.planType ?? null,
          linkedInterviewOrderId: completed.order.linkedInterviewOrderId ?? null,
          status: completed.order.status,
          usedCount: completed.order.usedCount,
          remainingGenerations: completed.order.remainingGenerations,
          doneAt: completed.order.doneAt,
          resultUrl: completed.resultUrl,
          resultExpiresAt: completed.resultExpiresAt,
          receiptUrl: completed.order.receiptUrl ?? null,
          emailSent: emailOutcome.sent,
        },
      });
    }

    // 2. Branch B (진단 완성본 생성 또는 신규/재생성): 메모 복구 fallback 확인
    let effectiveMemo = cleanMemo;
    let effectiveJobTitle = cleanJobTitle;
    if (!effectiveMemo) {
      const prevStored = await getStoredResultForOrder(orderId);
      if (prevStored?.sourceMemo) {
        effectiveMemo = prevStored.sourceMemo;
      }
      if (!effectiveJobTitle && prevStored?.jobTitle) {
        effectiveJobTitle = prevStored.jobTitle;
      }
    }

    if (!effectiveMemo) {
      const restored = await releaseOrderReservationWithoutDeduction({
        orderKey: begin.orderKey,
        order,
      });
      return NextResponse.json(
        {
          error: fromDiagnosis
            ? "자소서 원문을 다시 붙여넣어 주세요."
            : "미리보기 유효시간(2시간)이 만료되었거나 입력 메모가 비어 있습니다. 경험 메모를 입력한 뒤 다시 생성해 주세요.",
          code: fromDiagnosis ? "DIAGNOSIS_TEXT_MISSING" : "MEMO_REQUIRED",
          order: {
            orderId: restored.orderId,
            status: restored.status,
            remainingGenerations: restored.remainingGenerations,
          },
        },
        { status: 400 }
      );
    }

    const revisionWeaknesses =
      fromDiagnosis && Array.isArray(diagnosticWeaknesses)
        ? diagnosticWeaknesses
            .filter((w): w is string => typeof w === "string" && w.trim().length > 0)
            .slice(0, 6)
        : undefined;

    // 4문항 완성본 + 10개 면접 질문 병렬 생성 (Vercel 60초 예산: 1차 42s + 폴백 12s + 환불 <= 60s)
    const [resumeOutcome, interviewOutcome] = await Promise.all([
      generateFourQuestionsResume({
        genAI,
        jobTitle: effectiveJobTitle,
        memo: effectiveMemo,
        revisionWeaknesses,
        perAttemptTimeoutMs: 42_000,
        fallbackAttemptTimeoutMs: 12_000,
        totalBudgetMs: 54_000,
      }),
      generateTenInterviewQuestions({
        genAI,
        jobTitle: effectiveJobTitle,
        resumeContext: effectiveMemo,
      })
        .then((data) => ({ ok: true as const, data }))
        .catch((err) => ({ ok: false as const, error: err })),
    ]);

    let interviewQuestions: InterviewQuestionItem[] = [];
    let interviewPending = false;
    let interviewError: string | null = null;

    if (interviewOutcome.ok) {
      interviewQuestions = interviewOutcome.data.questions;
    } else {
      interviewPending = true;
      interviewError = sanitizeErrorText(interviewOutcome.error);
      await reportServerError({
        route: routePath,
        statusCode: 500,
        error: interviewOutcome.error,
        orderId,
        serviceType: "resume",
        extra: {
          stage: "branch_b_interview_partial_failure",
          usedCount: order.usedCount ?? 0,
        },
      });
    }

    const fullText = formatFullPackageText({
      jobTitle: effectiveJobTitle,
      items: resumeOutcome.items,
      interviewQuestions,
    });

    const resultTitle = effectiveJobTitle
      ? `[${effectiveJobTitle}] AI 자소서·면접 패키지 완성본`
      : "AI 자소서 4문항·면접 질문 10선 패키지";

    const completed = await completePaidGeneration({
      orderKey: begin.orderKey,
      order,
      title: resultTitle,
      text: fullText,
      usedModel: resumeOutcome.usedModel,
      items: resumeOutcome.items,
      interviewQuestions,
      interviewPending,
      interviewError,
      jobTitle: effectiveJobTitle,
      sourceMemo: effectiveMemo,
    });

    const emailOutcome = await sendResultEmail({
      to: completed.order.email,
      orderId: completed.order.orderId,
      serviceType: "resume",
      resultUrl: completed.resultUrl,
      expiresAt: completed.resultExpiresAt,
      receiptUrl: completed.order.receiptUrl ?? null,
    });

    return NextResponse.json({
      success: true,
      branch: fromDiagnosis ? "diagnosis_fix" : "fresh_package",
      partialFailure: interviewPending,
      interviewPending,
      text: fullText,
      items: resumeOutcome.items,
      interviewQuestions,
      sourceMemo: effectiveMemo,
      usedModel: resumeOutcome.usedModel,
      thinkingLevel: resumeOutcome.thinkingLevel,
      attempts: resumeOutcome.attempts,
      durationMs: resumeOutcome.durationMs,
      usage: resumeOutcome.usage,
      resultToken: completed.resultUrl.split("token=")[1] || "",
      order: {
        orderId: completed.order.orderId,
        serviceType: completed.order.serviceType,
        planType: completed.order.planType ?? null,
        linkedInterviewOrderId: completed.order.linkedInterviewOrderId ?? null,
        status: completed.order.status,
        usedCount: completed.order.usedCount,
        remainingGenerations: completed.order.remainingGenerations,
        doneAt: completed.order.doneAt,
        resultUrl: completed.resultUrl,
        resultExpiresAt: completed.resultExpiresAt,
        receiptUrl: completed.order.receiptUrl ?? null,
        emailSent: emailOutcome.sent,
      },
    });
  } catch (genError) {
    // Vercel maxDuration(60s) 내 1차(42s)+폴백(12s) 초과 직후에도 고객 자동 환불이 선행되도록 즉시 실행
    const failure = await handlePaidGenerationFailure({
      orderKey: begin.orderKey,
      order,
      error: genError,
      route: routePath,
    });

    await reportServerError({
      route: routePath,
      statusCode: 500,
      error: genError,
      orderId,
      serviceType: "resume",
      extra: {
        stage: "gemini_paid_package_generation",
        usedCount: order.usedCount ?? 0,
        failureOutcome: failure.outcome,
      },
    });

    if (failure.outcome === "refunded") {
      return NextResponse.json(
        {
          error: "생성 오류로 결제가 자동 전액 환불되었습니다",
          code: "AUTO_REFUNDED",
          refunded: true,
          order: {
            orderId: failure.order.orderId,
            status: failure.order.status,
            paid: failure.order.paid,
            remainingGenerations: failure.order.remainingGenerations,
            refundedAt: failure.order.refundedAt,
            refundAmount: failure.order.refundAmount,
            refundTransactionKey: failure.order.refundTransactionKey,
            refundReason: failure.order.refundReason,
          },
          tossCancel: failure.cancelResult.data
            ? {
                status: failure.cancelResult.data.status,
                orderId: failure.cancelResult.data.orderId,
                cancels: failure.cancelResult.data.cancels,
              }
            : null,
        },
        { status: 500 }
      );
    }

    if (failure.outcome === "refund_failed") {
      await reportServerError({
        route: routePath,
        statusCode: 502,
        error: `Critical: Paid generation failed AND automatic Toss refund failed (${failure.cancelResult.errorMessage || "unknown"})`,
        orderId,
        serviceType: "resume",
        extra: { stage: "refund_failed" },
      });

      return NextResponse.json(
        {
          error:
            "환불 처리 중입니다(영업일 기준 1~2일 내 처리). 지연 시 고객센터로 문의해 주세요.",
          refundPending: true,
          refunded: false,
          supportEmail: BUSINESS_INFO.email,
          kakaoChannelUrl: BUSINESS_INFO.kakaoChannelUrl,
          order: {
            orderId: failure.order.orderId,
            status: failure.order.status,
          },
        },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        error:
          "일시적인 생성 오류로 실패했습니다. 결제 횟수는 차감되지 않았으니 잠시 후 다시 시도해 주세요.",
        code: "GENERATION_RETRY_ALLOWED",
        refunded: false,
        order: {
          orderId: failure.order.orderId,
          status: failure.order.status,
          usedCount: failure.order.usedCount,
          remainingGenerations: failure.order.remainingGenerations,
        },
      },
      { status: 503 }
    );
  }
}
