import { NextResponse } from "next/server";
import type { Redis } from "@upstash/redis";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_CONFIG, generateContentWithFallback } from "@/lib/gemini";
import { checkFreeRateLimit, requireRedisClient } from "@/lib/redis";

// Vercel Serverless Function Execution Timeout (방어적 60초 설정)
export const maxDuration = 60;

export async function POST(req: Request) {
  // Initialize Gemini
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "dummy-api-key");
  let redis: Redis | null = null;

  try {
    const body = await req.json();
    const { jobTitle, memo, isFree, orderId } = body;

    // ── Strict Field Validation ──
    // Reject requests missing required fields or using legacy single-prompt format
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
    // If paid request, orderId must be a non-empty string
    if (!isFree && (typeof orderId !== "string" || !orderId.trim())) {
      return NextResponse.json(
        { error: "Bad Request. 'orderId' (string) is required for paid requests." },
        { status: 400 }
      );
    }

    // ── IP Parsing (proxy-chain safe) ──
    const ip = (req.headers.get("x-forwarded-for") ?? "127.0.0.1").split(",")[0].trim();

    // ── Rate Limiting / Payment Validation ──
    if (isFree) {
      // Free tier: slidingWindow 2 req / 24h per IP (Redis 장애 시 안전 폴백)
      const allowed = await checkFreeRateLimit({
        key: `ratelimit_free_${ip}`,
        maxRequests: 2,
        window: "24 h",
      });
      if (!allowed) {
        return NextResponse.json(
          { error: "Too Many Requests. Free tier limit exceeded (2 per 24h)." },
          { status: 429 }
        );
      }
    } else {
      // Paid tier: strictly require Redis & validate orderId
      redis = requireRedisClient();
      const orderData: any = await redis.get(`order:${orderId}`);

      if (
        !orderData ||
        !orderData.paid ||
        typeof orderData.remainingGenerations !== "number" ||
        orderData.remainingGenerations < 1
      ) {
        return NextResponse.json(
          { error: "Forbidden. Invalid payment info or generations exhausted." },
          { status: 403 }
        );
      }
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

    // Gemini 3.8 Flash (thinkingLevel: medium) 공통 설정 호출
    const genResult = await generateContentWithFallback(
      genAI,
      fullPrompt,
      GEMINI_CONFIG.PRIMARY_MODEL,
      GEMINI_CONFIG.THINKING_LEVEL
    );
    const responseText = genResult.text;

    // ── Deduct generation count (paid requests only) ──
    if (!isFree && orderId && redis) {
      const orderData: any = await redis.get(`order:${orderId}`);
      if (orderData && orderData.remainingGenerations > 0) {
        await redis.set(`order:${orderId}`, {
          ...orderData,
          remainingGenerations: orderData.remainingGenerations - 1,
        });
      }
    }

    return NextResponse.json({
      success: true,
      text: responseText,
      usedModel: genResult.usedModel,
      thinkingLevel: genResult.thinkingLevel,
      usage: genResult.usage,
    });

  } catch (error: any) {
    console.error("Error generating resume:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
