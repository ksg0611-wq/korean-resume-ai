import { NextResponse } from "next/server";
import {
  linkOrderPreviewToken,
  savePaymentIntent,
  validateInterviewUpgradeEligibility,
} from "@/lib/orders";
import { normalizeEmail, PRICING_PLANS } from "@/lib/policy";
import { reportServerError } from "@/lib/alerts";

export const maxDuration = 120;

type PreparablePlanType = keyof typeof PRICING_PLANS;

/**
 * 결제 창 호출 직전:
 * 1) orderId <-> previewToken 매핑 저장 및 preview TTL(7,200초) 연장
 * 2) planType / expectedAmount / baseOrderId 의도(payment_intent) 등록 및 +3,000원 업그레이드 사전 자격 검증
 */
export async function POST(req: Request) {
  let orderIdForLog: string | null = null;
  try {
    const body = await req.json();
    const orderId = typeof body?.orderId === "string" ? body.orderId.trim() : "";
    const previewToken =
      typeof body?.previewToken === "string" ? body.previewToken.trim() : "";
    const rawPlanType =
      typeof body?.planType === "string" ? body.planType.trim() : "";
    const baseOrderId =
      typeof body?.baseOrderId === "string" ? body.baseOrderId.trim() : "";
    const baseResultToken =
      typeof body?.baseResultToken === "string" ? body.baseResultToken.trim() : "";
    const email = normalizeEmail(body?.email);
    orderIdForLog = orderId || null;

    if (!orderId) {
      return NextResponse.json({ error: "orderId is required" }, { status: 400 });
    }

    const previewOutcome = previewToken
      ? await linkOrderPreviewToken({ orderId, previewToken })
      : { linked: false, previewExists: false, expiresAt: null };

    if (rawPlanType) {
      if (!(rawPlanType in PRICING_PLANS)) {
        return NextResponse.json(
          { error: "지원하지 않는 상품 유형입니다.", code: "INVALID_PLAN_TYPE" },
          { status: 400 }
        );
      }

      const planType = rawPlanType as PreparablePlanType;
      const expectedAmount = PRICING_PLANS[planType].price;

      if (planType === "interview_upgrade") {
        const eligibility = await validateInterviewUpgradeEligibility({
          baseOrderId,
          baseResultToken: baseResultToken || null,
          email,
        });

        if (!eligibility.eligible) {
          return NextResponse.json(
            {
              error: eligibility.message,
              code: eligibility.code,
              upgradedOrderId: eligibility.upgradedOrderId ?? null,
            },
            { status: 403 }
          );
        }
      }

      await savePaymentIntent({
        orderId,
        planType,
        expectedAmount,
        baseOrderId: planType === "interview_upgrade" ? baseOrderId : null,
        baseResultToken:
          planType === "interview_upgrade" && baseResultToken ? baseResultToken : null,
        email,
      });

      return NextResponse.json({
        ...previewOutcome,
        prepared: true,
        planType,
        expectedAmount,
      });
    }

    return NextResponse.json(previewOutcome);
  } catch (error) {
    console.error("[/api/payments/prepare] Error:", error);
    await reportServerError({
      route: "/api/payments/prepare",
      statusCode: 500,
      error,
      orderId: orderIdForLog,
    });
    // preview 링크 실패 시에도 일반 결제는 차단하지 않되, 의도/업그레이드 준비 중 예외는 500으로 안전 처리 가능
    return NextResponse.json({
      linked: false,
      previewExists: false,
      expiresAt: null,
      warning: "preview_link_failed",
    });
  }
}
