import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_CONFIG, generateContentWithFallback } from "@/lib/gemini";
import { checkFreeRateLimit } from "@/lib/redis";
import { FREE_LIMITS, FREE_LIMIT_WINDOW } from "@/lib/policy";
import { executePaidGeneration } from "@/lib/paymentHandlers";
import { reportServerError } from "@/lib/alerts";

// Vercel Serverless Function Execution Timeout (방어적 60초 설정)
export const maxDuration = 60;

export async function POST(req: Request) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "dummy-api-key");
  let parsedOrderId: string | null = null;

  try {
    const body = await req.json();
    const { jobTitle, memo, isFree, orderId, email } = body;
    parsedOrderId = typeof orderId === "string" ? orderId.trim() : null;

    // ── Strict Field Validation ──
    if (typeof jobTitle !== "string" || !jobTitle.trim()) {
      return NextResponse.json(
        { error: "Bad Request. 'jobTitle' (string) is required." },
        { status: 400 }
      );
    }
    if (typeof memo !== "string" || !memo.trim()) {
      return NextResponse.json(
        { error: "Bad Request. 'memo' (string) is required." },
        { status: 400 }
      );
    }
    if (typeof isFree !== "boolean") {
      return NextResponse.json(
        { error: "Bad Request. 'isFree' (boolean) is required." },
        { status: 400 }
      );
    }
    if (!isFree && (!parsedOrderId || !parsedOrderId.trim())) {
      return NextResponse.json(
        { error: "Bad Request. 'orderId' (string) is required for paid requests." },
        { status: 400 }
      );
    }

    // ── Prompt Engineering ──
    const systemInstruction = `
당신은 한국 시장에 최적화된 전문 자기소개서 컨설턴트입니다.
사용자가 제공한 경험을 바탕으로 완벽한 자기소개서 초안을 작성해주세요.

다음 규칙을 반드시 준수하세요:
1. 답변 상단에 내용을 요약한 [소제목]을 포함할 것. (소제목은 반드시 15자 내외로 작성할 것. 절대 20자를 초과하지 마시오.)
2. 본문은 STAR(상황 Situation, 과제 Task, 행동 Action, 결과 Result) 프레임워크 구조로 마크다운(Markdown) 포맷에 맞춰 명확하게 구분하여 작성할 것.
3. 어투는 반드시 한국어 비즈니스 톤('~했습니다', '~합니다')을 사용할 것.
`;

    const fullPrompt = `${systemInstruction}\n\n지원 직무: ${jobTitle.trim()}\n\n사용자 경험 요약:\n${memo.trim()}`;

    if (!isFree && parsedOrderId) {
      return await executePaidGeneration({
        serviceType: "resume",
        routePath: "/api/generate",
        orderId: parsedOrderId,
        genAI,
        prompt: fullPrompt,
        resultTitle: `AI 자기소개서 초안 (${jobTitle.trim()})`,
        optionalEmail: email,
      });
    }

    // ── Free Tier Rate Limiting & Execution ──
    const ip = (req.headers.get("x-forwarded-for") ?? "127.0.0.1").split(",")[0].trim();
    const allowed = await checkFreeRateLimit({
      key: `ratelimit_free_${ip}`,
      maxRequests: FREE_LIMITS.resume,
      window: FREE_LIMIT_WINDOW,
    });
    if (!allowed) {
      return NextResponse.json(
        { error: `Too Many Requests. Free tier limit exceeded (${FREE_LIMITS.resume} per 24h).` },
        { status: 429 }
      );
    }

    const genResult = await generateContentWithFallback(
      genAI,
      fullPrompt,
      GEMINI_CONFIG.PRIMARY_MODEL,
      GEMINI_CONFIG.THINKING_LEVEL
    );

    return NextResponse.json({
      success: true,
      text: genResult.text,
      usedModel: genResult.usedModel,
      thinkingLevel: genResult.thinkingLevel,
      attempts: genResult.attempts,
      durationMs: genResult.durationMs,
      usage: genResult.usage,
    });
  } catch (error: any) {
    console.error("Error generating resume:", error);
    await reportServerError({
      route: "/api/generate",
      statusCode: 500,
      error,
      orderId: parsedOrderId,
      serviceType: "resume",
    });
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
