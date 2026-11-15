import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { checkFreeRateLimit } from "@/lib/redis";
import { FREE_LIMITS, FREE_LIMIT_WINDOW } from "@/lib/policy";
import {
  buildDiagnosticReport,
  buildFreeDiagnosticResponse,
} from "@/lib/diagnoseRubric";
import { evaluateDiagnosisWithAI } from "@/lib/packageGenerator";
import { reportServerError } from "@/lib/alerts";

export const maxDuration = 60;

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "127.0.0.1";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    const jobTitle = typeof body?.jobTitle === "string" ? body.jobTitle.trim() : "";
    const questionPrompt =
      typeof body?.questionPrompt === "string" ? body.questionPrompt.trim() : "";
    const rawTarget = Number(body?.targetChars);
    const targetChars =
      Number.isFinite(rawTarget) && rawTarget >= 100 && rawTarget <= 5000
        ? Math.round(rawTarget)
        : 700;

    if (!text || text.length < 80) {
      return NextResponse.json(
        { error: "정확한 진단을 위해 자소서 원문을 최소 80자 이상 입력해 주세요." },
        { status: 400 }
      );
    }

    if (text.length > 6000) {
      return NextResponse.json(
        { error: "진단 가능한 최대 분량(6,000자)을 초과했습니다. 문항 단위로 입력해 주세요." },
        { status: 400 }
      );
    }

    const ip = getClientIp(req);
    const allowed = await checkFreeRateLimit({
      key: `ratelimit_free_${ip}`,
      maxRequests: FREE_LIMITS.resume,
      window: FREE_LIMIT_WINDOW,
    });

    if (!allowed) {
      return NextResponse.json(
        {
          error: `하루 무료 이용 한도(${FREE_LIMITS.resume}회)를 모두 소진했습니다. 유료 패키지를 이용하시면 무제한 진단과 즉시 완성본 교정을 받으실 수 있습니다.`,
          code: "FREE_LIMIT_EXCEEDED",
        },
        { status: 429 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      await reportServerError({
        route: "/api/diagnose",
        statusCode: 500,
        error: "GEMINI_API_KEY is not configured",
      });
      return NextResponse.json(
        { error: "서버 AI 설정이 완료되지 않았습니다." },
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const { evaluation, usedModel, durationMs } = await evaluateDiagnosisWithAI({
      genAI,
      text,
      jobTitle,
      questionPrompt,
      targetChars,
    });

    // 원문은 Redis/DB에 일절 저장하지 않고 즉시 진단 점수 계산 후 서버 필터링 응답만 반환
    const fullReport = buildDiagnosticReport(text, targetChars, evaluation);
    const freeResponse = buildFreeDiagnosticResponse(fullReport);

    return NextResponse.json({
      ...freeResponse,
      usedModel,
      durationMs,
    });
  } catch (error) {
    console.error("[/api/diagnose] Error:", error);
    await reportServerError({
      route: "/api/diagnose",
      statusCode: 500,
      error,
    });
    return NextResponse.json(
      { error: "자소서 진단 분석 중 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 }
    );
  }
}
