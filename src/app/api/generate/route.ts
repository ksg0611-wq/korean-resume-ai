import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { checkFreeRateLimit } from "@/lib/redis";
import { FREE_LIMITS, FREE_LIMIT_WINDOW } from "@/lib/policy";
import { executePaidPackageGeneration } from "@/lib/paymentHandlers";
import { savePreviewRecord } from "@/lib/orders";
import {
  buildLockedPreviewResponse,
  generateFourQuestionsResume,
} from "@/lib/packageGenerator";
import { reportServerError } from "@/lib/alerts";

export const maxDuration = 60;

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "127.0.0.1";
}

export async function POST(req: Request) {
  let orderIdForLog: string | null = null;
  try {
    const body = await req.json();
    const jobTitle = typeof body?.jobTitle === "string" ? body.jobTitle.trim() : "";
    const memo = typeof body?.memo === "string" ? body.memo.trim() : "";
    const isFree = Boolean(body?.isFree);
    const orderId = typeof body?.orderId === "string" ? body.orderId.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim() : null;
    const previewToken =
      typeof body?.previewToken === "string" ? body.previewToken.trim() : null;
    const fromDiagnosis = Boolean(body?.fromDiagnosis);
    const diagnosticWeaknesses = Array.isArray(body?.diagnosticWeaknesses)
      ? body.diagnosticWeaknesses
      : undefined;

    orderIdForLog = orderId || null;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      await reportServerError({
        route: "/api/generate",
        statusCode: 500,
        error: "GEMINI_API_KEY is not configured",
        orderId: orderIdForLog,
        serviceType: "resume",
      });
      return NextResponse.json(
        { error: "서버 AI 설정이 완료되지 않았습니다." },
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    if (!isFree) {
      if (!orderId) {
        return NextResponse.json(
          { error: "결제 주문번호(orderId)가 필요합니다." },
          { status: 400 }
        );
      }

      return await executePaidPackageGeneration({
        routePath: "/api/generate",
        orderId,
        genAI,
        jobTitle,
        memo,
        previewToken,
        fromDiagnosis,
        diagnosticWeaknesses,
        optionalEmail: email,
      });
    }

    // 무료 체험 (전 문항 일괄 생성 후 1문항 공개 + 2~4문항 잠금)
    if (!memo) {
      return NextResponse.json(
        { error: "핵심 경험 메모를 입력해 주세요." },
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
          error: `하루 무료 이용 한도(${FREE_LIMITS.resume}회)를 모두 소진했습니다. 유료 결제를 통해 4문항 전체와 맞춤 면접 질문 10선을 즉시 확인해 보세요.`,
          code: "FREE_LIMIT_EXCEEDED",
        },
        { status: 429 }
      );
    }

    const draftResult = await generateFourQuestionsResume({
      genAI,
      jobTitle,
      memo,
      perAttemptTimeoutMs: 30_000,
      totalBudgetMs: 45_000,
    });

    let storedPreviewToken: string | null = null;
    let previewExpiresAt: string | null = null;

    try {
      const saved = await savePreviewRecord({
        jobTitle,
        memo,
        items: draftResult.items,
        usedModel: draftResult.usedModel,
        thinkingLevel: draftResult.thinkingLevel,
      });
      storedPreviewToken = saved.previewToken;
      previewExpiresAt = saved.expiresAt;
    } catch (previewErr) {
      console.error(
        "[Preview Fallback] Redis error during free preview save. Continuing without stored previewToken:",
        previewErr
      );
    }

    const { previewItems, lockedItems } = buildLockedPreviewResponse(
      draftResult.items
    );

    return NextResponse.json({
      success: true,
      mode: "draft",
      isFree: true,
      previewToken: storedPreviewToken,
      previewExpiresAt,
      text: previewItems[0]?.body || "",
      items: previewItems,
      lockedItems,
      usedModel: draftResult.usedModel,
      thinkingLevel: draftResult.thinkingLevel,
      attempts: draftResult.attempts,
      durationMs: draftResult.durationMs,
      usage: draftResult.usage,
    });
  } catch (error) {
    console.error("[/api/generate] Error:", error);
    await reportServerError({
      route: "/api/generate",
      statusCode: 500,
      error,
      orderId: orderIdForLog,
      serviceType: "resume",
    });
    return NextResponse.json(
      { error: "자소서 생성 중 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 }
    );
  }
}
