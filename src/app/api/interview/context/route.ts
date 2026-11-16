import { NextResponse } from "next/server";
import { getJobDetail } from "@/lib/db/jobs";
import {
  resolveBundledInterviewContext,
  validateInterviewUpgradeEligibility,
} from "@/lib/orders";
import { DEFAULT_INTERVIEW_JOB_CATEGORY, PRICING_PLANS } from "@/lib/policy";

export const dynamic = "force-dynamic";

function inferJobCategoryFromTitle(jobTitle: string | null | undefined): string {
  if (!jobTitle) return DEFAULT_INTERVIEW_JOB_CATEGORY;
  if (/디지털|전산|데이터|소프트웨어|시스템|개발|IT|정보|기술|안전|전기|토목|설비|기계|건축|현장/i.test(jobTitle)) {
    if (/소프트웨어|프론트|백엔드|개발자|웹/i.test(jobTitle)) {
      return "IT / 개발";
    }
    return "공기업 기술·전산·데이터(NCS)";
  }
  if (/민원|상담|복지|고객|서비스|행정|기획/i.test(jobTitle)) {
    if (/경영|회계|사무|총무|인사|재무/i.test(jobTitle)) {
      return DEFAULT_INTERVIEW_JOB_CATEGORY;
    }
    return "공공서비스·민원·기획";
  }
  if (/마케팅|홍보|PR|콘텐츠/i.test(jobTitle)) {
    return "마케팅 / 홍보";
  }
  return DEFAULT_INTERVIEW_JOB_CATEGORY;
}

/**
 * GET /api/interview/context
 * - sn: 채용공고 상세에서 서버 DB 직접 조회 (클라이언트 텍스트 변조 차단)
 * - upgradeFrom + token: 자소서 구매자 +3,000원 업그레이드 할인 자격 및 원문 자동 로드(7일 만료 시 재입력 안내)
 * - bundleFrom + token: 7,900원 통합 패키지 구매자의 연동 면접 주문(int_{orderId}) 및 자소서 원문 로드
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const snParam = searchParams.get("sn")?.trim() || "";
    const upgradeFrom = searchParams.get("upgradeFrom")?.trim() || "";
    const bundleFrom = searchParams.get("bundleFrom")?.trim() || "";
    const token = searchParams.get("token")?.trim() || "";

    if (snParam) {
      const sn = Number.parseInt(snParam, 10);
      if (!Number.isFinite(sn) || sn <= 0) {
        return NextResponse.json(
          { error: "유효하지 않은 공고 번호(sn)입니다." },
          { status: 400 }
        );
      }
      const job = await getJobDetail(sn);
      if (!job) {
        return NextResponse.json(
          { error: "해당 채용공고를 찾을 수 없습니다." },
          { status: 404 }
        );
      }

      const categoryHint = [job.title, ...(job.ncs_names || [])].join(" ");
      return NextResponse.json({
        mode: "job",
        eligible: true,
        jobCategory: inferJobCategoryFromTitle(categoryHint),
        jobContext: {
          sn: job.sn,
          instName: job.inst_name,
          title: job.title,
          ncsNames: job.ncs_names || [],
          qualification: job.qualification ?? null,
          preference: job.preference ?? null,
          procedureInfo: job.procedure_info ?? null,
        },
      });
    }

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
