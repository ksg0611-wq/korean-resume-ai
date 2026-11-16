import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { verifyAndGetStoredResult } from "@/lib/results";
import { updateOrderInterviewQuestions } from "@/lib/orders";
import {
  formatFullPackageText,
  generateTenInterviewQuestions,
} from "@/lib/packageGenerator";
import { reportServerError } from "@/lib/alerts";

export const maxDuration = 120;

/**
 * 부분 실패 복구 엔드포인트 (interviewPending: true 인 주문에 대해 추가 횟수 차감 없이 10개 면접 질문 재시도)
 */
export async function POST(req: Request) {
  let orderIdForLog: string | null = null;
  try {
    const body = await req.json();
    const orderId = typeof body?.orderId === "string" ? body.orderId.trim() : "";
    const resultToken =
      (typeof body?.resultToken === "string" ? body.resultToken.trim() : "") ||
      req.headers.get("x-result-token")?.trim() ||
      "";
    orderIdForLog = orderId || null;

    if (!orderId || !resultToken) {
      return NextResponse.json(
        { error: "주문번호(orderId)와 결과 인증 토큰이 필요합니다." },
        { status: 400 }
      );
    }

    const outcome = await verifyAndGetStoredResult(orderId, resultToken);
    if (outcome.status === 403) {
      return NextResponse.json(
        { error: "유효하지 않은 결과 인증 토큰입니다.", code: "FORBIDDEN" },
        { status: 403 }
      );
    }
    if (outcome.status === 410) {
      return NextResponse.json(
        { error: "결과 보관 기간(7일)이 만료되었습니다.", code: "GONE" },
        { status: 410 }
      );
    }

    const { result, order } = outcome;
    if (
      !result.interviewPending &&
      Array.isArray(result.interviewQuestions) &&
      result.interviewQuestions.length > 0
    ) {
      return NextResponse.json({
        success: true,
        alreadyCompleted: true,
        interviewPending: false,
        interviewQuestions: result.interviewQuestions,
        text: result.text,
        remainingGenerations: order.remainingGenerations,
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "서버 AI 설정이 완료되지 않았습니다." },
        { status: 500 }
      );
    }

    const resumeContext =
      Array.isArray(result.items) && result.items.length > 0
        ? result.items.map((item) => `[${item.title}]\n${item.body}`).join("\n\n")
        : result.text;

    const genAI = new GoogleGenerativeAI(apiKey);
    const interviewRes = await generateTenInterviewQuestions({
      genAI,
      jobTitle: result.jobTitle || "",
      resumeContext,
    });

    const updatedText =
      Array.isArray(result.items) && result.items.length > 0
        ? formatFullPackageText({
            jobTitle: result.jobTitle,
            items: result.items,
            interviewQuestions: interviewRes.questions,
          })
        : result.text;

    await updateOrderInterviewQuestions({
      orderId,
      interviewQuestions: interviewRes.questions,
      text: updatedText,
    });

    return NextResponse.json({
      success: true,
      interviewPending: false,
      interviewQuestions: interviewRes.questions,
      text: updatedText,
      usedModel: interviewRes.usedModel,
      remainingGenerations: order.remainingGenerations,
      usedCount: order.usedCount,
    });
  } catch (error) {
    console.error("[/api/interview/retry] Error:", error);
    await reportServerError({
      route: "/api/interview/retry",
      statusCode: 500,
      error,
      orderId: orderIdForLog,
      serviceType: "resume",
    });
    return NextResponse.json(
      {
        error:
          "면접 질문 생성에 일시적인 오류가 발생했습니다. 횟수는 추가 차감되지 않았으니 잠시 후 다시 시도해 주세요.",
        code: "INTERVIEW_RETRY_FAILED",
      },
      { status: 500 }
    );
  }
}
