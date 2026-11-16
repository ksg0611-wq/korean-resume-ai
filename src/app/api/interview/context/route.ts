import { NextResponse } from "next/server";
import {
  resolveBundledInterviewContext,
  validateInterviewUpgradeEligibility,
} from "@/lib/orders";
import { DEFAULT_INTERVIEW_JOB_CATEGORY, PRICING_PLANS } from "@/lib/policy";

export const dynamic = "force-dynamic";

function inferJobCategoryFromTitle(jobTitle: string | null | undefined): string {
  if (!jobTitle) return DEFAULT_INTERVIEW_JOB_CATEGORY;
  if (/디지털|전산|데이터|소프트웨어|개발|IT|시스템|정보/i.test(jobTitle)) {
    return "공공기관 디지털·IT";
  }
  if (/민원|상담|복지|고객|서비스|CS/i.test(jobTitle)) {
    return "고객서비스·민원 응대";
  }
  if (/기술|안전|전기|토목|설비|기계|건축|현장/i.test(jobTitle)) {
    return "공공기관 기술·안전·설비";
  }
  if (/마케팅|홍보|PR|기획/i.test(jobTitle)) {
    return "마케팅·홍보·대외협력";
  }
  return DEFAULT_INTERVIEW_JOB_CATEGORY;
}

/**
 * GET /api/interview/context
 * - upgradeFrom + token: 자소서 구매자 +3,000원 업그레이드 할인 자격 및 원문 자동 로드(7일 만료 시 재입력 안내)
 * - bundleFrom + token: 7,900원 통합 패키지 구매자의 연동 면접 주문(int_{orderId}) 및 자소서 원문 로드
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const upgradeFrom = searchParams.get("upgradeFrom")?.trim() || "";
    const bundleFrom = searchParams.get("bundleFrom")?.trim() || "";
    const token = searchParams.get("token")?.trim() || "";

    if (upgradeFrom) {
      const eligibility = await validateInterviewUpgradeEligibility({
        baseOrderId: upgradeFrom,
        baseResultToken: token || null,
      });

      if (!eligibility.eligible) {
        return NextResponse.json(
          {
            mode: "upgrade",
            eligible: false,
            code: eligibility.code,
            message: eligibility.message,
            upgradedOrderId: eligibility.upgradedOrderId ?? null,
          },
          { status: 403 }
        );
      }

      return NextResponse.json({
        mode: "upgrade",
        eligible: true,
        baseOrderId: eligibility.baseOrder.orderId,
        discountPrice: PRICING_PLANS.interview_upgrade.price,
        jobTitle: eligibility.jobTitle,
        jobCategory: inferJobCategoryFromTitle(eligibility.jobTitle),
        resumeText: eligibility.resumeText,
        resumeExpired: eligibility.resumeExpired,
      });
    }

    if (bundleFrom) {
      const ctx = await resolveBundledInterviewContext({
        baseOrderId: bundleFrom,
        baseResultToken: token || null,
      });

      if (!ctx.ok || !ctx.linkedInterviewOrderId) {
        return NextResponse.json(
          {
            mode: "bundle",
            eligible: false,
            message: "유효한 통합 패키지 면접 이용권을 찾을 수 없습니다.",
          },
          { status: 403 }
        );
      }

      return NextResponse.json({
        mode: "bundle",
        eligible: true,
        linkedInterviewOrderId: ctx.linkedInterviewOrderId,
        remainingGenerations: ctx.remainingGenerations,
        jobTitle: ctx.jobTitle,
        jobCategory: inferJobCategoryFromTitle(ctx.jobTitle),
        resumeText: ctx.resumeText,
        resumeExpired: ctx.resumeExpired,
      });
    }

    return NextResponse.json(
      { error: "조회할 upgradeFrom 또는 bundleFrom 파라미터가 필요합니다." },
      { status: 400 }
    );
  } catch (error) {
    console.error("[GET /api/interview/context] Error:", error);
    return NextResponse.json(
      { error: "면접 연동 정보를 불러오는 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
