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
    const { jobCategory, resumeText, isFree, orderId, email } = body;
    parsedOrderId = typeof orderId === "string" ? orderId.trim() : null;

    if (!jobCategory || !resumeText || typeof isFree !== "boolean") {
      return NextResponse.json(
        { error: "Invalid payload. Missing jobCategory, resumeText, or isFree." },
        { status: 400 }
      );
    }

    if (!isFree && !parsedOrderId) {
      return NextResponse.json(
        { error: "orderId is required for paid generation." },
        { status: 400 }
      );
    }

    // ── Prompt Engineering ──
    let roleDescription = "";
    switch (jobCategory) {
      case "IT":
        roleDescription = "소프트웨어 엔지니어링, 데이터 분석 및 IT 인프라 직군 전문 면접관";
        break;
      case "기획":
        roleDescription = "서비스 기획, 전략 및 PM(프로덕트 매니저) 직군 전문 면접관";
        break;
      case "마케팅":
        roleDescription = "퍼포먼스 마케팅, 콘텐츠 기획 및 브랜드 마케팅 직군 전문 면접관";
        break;
      case "기타":
      default:
        roleDescription = "인사(HR) 및 실무 종합 면접관";
        break;
    }

    const systemInstruction = `
당신은 ${roleDescription}입니다. 
지원자의 자기소개서를 바탕으로 STAR(Situation, Task, Action, Result) 기법에 기반한 날카롭고 심층적인 면접 꼬리질문 3단계를 생성해야 합니다.

다음 구조를 엄격하게 지켜 출력하세요:

[1단계: 상황/행동 사실 확인]
(이력서에 작성된 경험의 구체적인 맥락과 지원자의 실제 기여도를 검증하는 질문)

[2단계: 의사결정 근거 검증]
(왜 그러한 행동이나 선택을 했는지, 다른 대안은 고려하지 않았는지 논리력을 묻는 심화 질문)

[3단계: 압박 및 모순 지적]
(예상치 못한 실패 상황을 가정하거나, 결과의 신빙성을 파고드는 가장 높은 난이도의 압박형 질문)

주의사항:
1. 반드시 마크다운 형식으로 위 3단계를 구분하여 작성할 것.
2. 친절하게 묻지 말고, 실제 실무진 면접관처럼 예리하고 전문적인 비즈니스 톤으로 질문할 것.
3. 질문 전후에 불필요한 사족(인사말, 응원 등)을 붙이지 말 것.
`;

    const fullPrompt = `${systemInstruction}\n\n지원자 자기소개서:\n${String(resumeText).trim()}`;

    if (!isFree && parsedOrderId) {
      return await executePaidGeneration({
        serviceType: "interview",
        routePath: "/api/interview/generate",
        orderId: parsedOrderId,
        genAI,
        prompt: fullPrompt,
        resultTitle: `AI 면접 꼬리질문 리포트 (${String(jobCategory).trim()})`,
        optionalEmail: email,
      });
    }

    // ── Free Tier Rate Limiting & Execution ──
    const ip = (req.headers.get("x-forwarded-for") ?? "127.0.0.1").split(",")[0].trim();
    const allowed = await checkFreeRateLimit({
      key: `ratelimit:interview:ip:${ip}`,
      maxRequests: FREE_LIMITS.interview,
      window: FREE_LIMIT_WINDOW,
    });
    if (!allowed) {
      return NextResponse.json(
        { error: `Too Many Requests. Free tier limit exceeded (${FREE_LIMITS.interview} per 24h).` },
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
    console.error("Generate API Error:", error);
    await reportServerError({
      route: "/api/interview/generate",
      statusCode: 500,
      error,
      orderId: parsedOrderId,
      serviceType: "interview",
    });
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
