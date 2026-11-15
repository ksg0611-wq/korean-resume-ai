import { NextResponse } from "next/server";
import type { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_CONFIG, generateContentWithFallback } from "@/lib/gemini";
import { reportServerError } from "@/lib/alerts";
import { confirmTossPayment } from "@/lib/toss";
import { sendResultEmail } from "@/lib/email";
import {
  beginPaidGeneration,
  completePaidGeneration,
  handlePaidGenerationFailure,
  saveConfirmedOrder,
} from "@/lib/orders";
import { normalizeEmail } from "@/lib/policy";
import type { ServiceType } from "@/lib/results";
import { BUSINESS_INFO } from "@/lib/siteConfig";

/**
 * 토스 결제 승인 공통 라우트 핸들러 (/api/payments/success, /api/interview/payment 공용)
 */
export async function handleConfirmPaymentRequest(
  req: Request,
  options: { serviceType: ServiceType; routePath: string }
): Promise<NextResponse> {
  const { serviceType, routePath } = options;
  let orderIdForLog: string | null = null;

  try {
    const body = await req.json();
    const { paymentKey, orderId, amount, email } = body || {};
    orderIdForLog = typeof orderId === "string" ? orderId : null;

    if (!paymentKey || !orderId || !amount) {
      return NextResponse.json({ message: "Bad Request" }, { status: 400 });
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
    const resolvedEmail =
      normalizeEmail(email) || normalizeEmail(paymentData?.customerEmail);

    const { order, alreadyConfirmed } = await saveConfirmedOrder({
      orderId,
      serviceType,
      paymentKey,
      amount:
        typeof paymentData?.totalAmount === "number"
          ? paymentData.totalAmount
          : Number(amount),
      email: resolvedEmail,
      receiptUrl:
        typeof paymentData?.receipt?.url === "string"
          ? paymentData.receipt.url
          : null,
    });

    return NextResponse.json({
      success: true,
      alreadyConfirmed,
      payment: paymentData,
      order: {
        orderId: order.orderId,
        serviceType: order.serviceType,
        status: order.status,
        amount: order.amount,
        paidAt: order.paidAt,
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
      GEMINI_CONFIG.PRIMARY_MODEL,
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
