import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: Request) {
  // Initialize Redis inside function to ensure env vars are loaded at runtime
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "https://dummy-url.upstash.io",
    token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "dummy-token",
  });

  // Initialize Rate Limiter: max 3 requests per 24 hours per IP (slidingWindow)
  const ratelimit = new Ratelimit({
    redis: redis,
    limiter: Ratelimit.slidingWindow(3, "24 h"),
  });

  // Initialize Gemini
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "dummy-api-key");

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
      // Free tier: slidingWindow 3 req / 24h per IP
      const { success } = await ratelimit.limit(`ratelimit_free_${ip}`);
      if (!success) {
        return NextResponse.json(
          { error: "Too Many Requests. Free tier limit exceeded (3 per 24h)." },
          { status: 429 }
        );
      }
    } else {
      // Paid tier: validate orderId against Redis
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

    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });
    const result = await model.generateContent(fullPrompt);
    const responseText = result.response.text();

    // ── Deduct generation count (paid requests only) ──
    if (!isFree && orderId) {
      const orderData: any = await redis.get(`order:${orderId}`);
      if (orderData && orderData.remainingGenerations > 0) {
        await redis.set(`order:${orderId}`, {
          ...orderData,
          remainingGenerations: orderData.remainingGenerations - 1,
        });
      }
    }

    return NextResponse.json({ text: responseText });

  } catch (error: any) {
    console.error("Error generating resume:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
