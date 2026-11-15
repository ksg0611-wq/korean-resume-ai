import {
  GoogleGenerativeAI,
  type GenerationConfig,
  type UsageMetadata,
} from "@google/generative-ai";

export type ThinkingLevel = "minimal" | "low" | "medium" | "high";

/**
 * 서비스 전역 Gemini 모델 및 추론 강도 · 시간 예산 공통 설정
 * - Vercel Serverless maxDuration = 60초 초과(504) 방지 구조:
 *   · 단문/일반 호출: 1차 20초 + 폴백 20초 <= 총 40초 (잔여 20초: Redis/환불 여유)
 *   · 다중 4문항 일괄 생성(draft/final): 1차 30,000ms + 폴백 20,000ms <= 총 50,000ms (잔여 10,000ms: 입출력·Redis·응답 안전 여유)
 */
export const GEMINI_CONFIG = {
  PRIMARY_MODEL: "gemini-3.8-flash",
  FALLBACK_MODEL: "gemini-3.7-flash",
  THINKING_LEVEL: "medium" as ThinkingLevel,
  PER_ATTEMPT_TIMEOUT_MS: 20_000,
  FALLBACK_ATTEMPT_TIMEOUT_MS: 20_000,
  TOTAL_BUDGET_MS: 40_000,
} as const;

interface ThinkingGenerationConfig extends GenerationConfig {
  thinkingConfig?: {
    thinkingLevel?: ThinkingLevel;
  };
}

type ExtendedUsageMetadata = UsageMetadata & {
  thoughtsTokenCount?: number;
};

export interface GenerateResult {
  text: string;
  usedModel: string;
  thinkingLevel: ThinkingLevel;
  attempts: number;
  durationMs: number;
  usage: {
    promptTokens: number;
    completionTokens: number;
    thinkingTokens: number;
    totalTokens: number;
  };
}

export interface GenerateOptions {
  perAttemptTimeoutMs?: number;
  fallbackAttemptTimeoutMs?: number;
  totalBudgetMs?: number;
  responseMimeType?: string;
  responseSchema?: any;
  temperature?: number;
}

/**
 * 404, 403, 모델 미승인/미존재 에러 감지 헬퍼
 */
export function isModelNotAvailableError(err: any): boolean {
  const status = err?.status;
  const msg = (err?.message || "").toLowerCase();
  return (
    status === 404 ||
    status === 403 ||
    msg.includes("not found") ||
    msg.includes("is not supported") ||
    msg.includes("unsupported") ||
    msg.includes("permission denied") ||
    msg.includes("access denied")
  );
}

class GeminiTimeoutError extends Error {
  readonly code = "GEMINI_TIMEOUT";
  constructor(message: string) {
    super(message);
    this.name = "GeminiTimeoutError";
  }
}

async function generateWithTimeout(
  genAI: GoogleGenerativeAI,
  modelName: string,
  generationConfig: ThinkingGenerationConfig,
  prompt: string,
  timeoutMs: number
) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig,
  });

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(
        new GeminiTimeoutError(
          `Gemini request timed out after ${timeoutMs}ms (model=${modelName})`
        )
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      model.generateContent(prompt, {
        timeout: timeoutMs,
        signal: controller.signal,
      }),
      timeoutPromise,
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

/**
 * 최신 Flash 모델 호출 + 시간 예산(개별 22초 / 총 45초) 방어 + 폴백 모델 1회 자동 재시도
 * 1) 초기 모델(PRIMARY_MODEL) 호출 (최대 22초)
 * 2) 실패·타임아웃 시 남은 45초 시간 예산 내에서 FALLBACK_MODEL(gemini-3.7-flash)로 1회 자동 재시도
 * 3) 재시도까지 실패하거나 시간 예산 소진 시 에러 throw → 상위 라우트에서 자동 환불(usedCount===0) 또는 미차감 재시도 안내 처리
 */
export async function generateContentWithFallback(
  genAI: GoogleGenerativeAI,
  prompt: string,
  preferredModel: string = GEMINI_CONFIG.PRIMARY_MODEL,
  thinkingLevel: ThinkingLevel = GEMINI_CONFIG.THINKING_LEVEL,
  options?: GenerateOptions
): Promise<GenerateResult> {
  const perAttemptTimeoutMs = options?.perAttemptTimeoutMs
    ? Math.min(options.perAttemptTimeoutMs, 35_000)
    : GEMINI_CONFIG.PER_ATTEMPT_TIMEOUT_MS;
  const fallbackAttemptTimeoutMs = options?.fallbackAttemptTimeoutMs
    ? Math.min(options.fallbackAttemptTimeoutMs, 25_000)
    : Math.min(perAttemptTimeoutMs, GEMINI_CONFIG.FALLBACK_ATTEMPT_TIMEOUT_MS);
  const totalBudgetMs = options?.totalBudgetMs
    ? Math.min(options.totalBudgetMs, 50_000)
    : GEMINI_CONFIG.TOTAL_BUDGET_MS;

  const modelsToTry = Array.from(
    new Set([preferredModel, GEMINI_CONFIG.FALLBACK_MODEL])
  );

  const generationConfig: ThinkingGenerationConfig = {
    thinkingConfig: {
      thinkingLevel,
    },
    ...(options?.responseMimeType
      ? { responseMimeType: options.responseMimeType }
      : {}),
    ...(options?.responseSchema ? { responseSchema: options.responseSchema } : {}),
    ...(typeof options?.temperature === "number"
      ? { temperature: options.temperature }
      : {}),
  };

  const startedAt = Date.now();
  let lastError: any = null;
  let attempts = 0;

  for (let i = 0; i < modelsToTry.length; i++) {
    const elapsedMs = Date.now() - startedAt;
    const remainingBudgetMs = totalBudgetMs - elapsedMs;

    if (remainingBudgetMs <= 500) {
      lastError =
        lastError ||
        new GeminiTimeoutError(
          `Gemini total budget (${totalBudgetMs}ms) exhausted before attempt ${i + 1}`
        );
      break;
    }

    const attemptBudgetLimit =
      i === 0 ? perAttemptTimeoutMs : fallbackAttemptTimeoutMs;
    const attemptTimeoutMs = Math.max(
      1,
      Math.min(attemptBudgetLimit, remainingBudgetMs)
    );
    const currentModelName = modelsToTry[i];
    attempts = i + 1;

    try {
      const result = await generateWithTimeout(
        genAI,
        currentModelName,
        generationConfig,
        prompt,
        attemptTimeoutMs
      );
      const text = result.response.text();
      if (!text || !text.trim()) {
        throw new Error(`Empty response returned from Gemini (model=${currentModelName})`);
      }

      const usage = result.response.usageMetadata as ExtendedUsageMetadata | undefined;

      return {
        text,
        usedModel: currentModelName,
        thinkingLevel,
        attempts,
        durationMs: Date.now() - startedAt,
        usage: {
          promptTokens: usage?.promptTokenCount ?? 0,
          completionTokens: usage?.candidatesTokenCount ?? 0,
          thinkingTokens: usage?.thoughtsTokenCount ?? 0,
          totalTokens: usage?.totalTokenCount ?? 0,
        },
      };
    } catch (err: any) {
      lastError = err;
      const postElapsedMs = Date.now() - startedAt;
      const postRemainingMs = totalBudgetMs - postElapsedMs;

      if (i < modelsToTry.length - 1 && postRemainingMs > 500) {
        const nextModel = modelsToTry[i + 1];
        const reasonTag = isModelNotAvailableError(err)
          ? "model-unavailable"
          : err?.code === "GEMINI_TIMEOUT"
            ? "timeout"
            : "runtime-error";
        console.warn(
          `[MODEL_FALLBACK] Attempt ${attempts} ('${currentModelName}') failed (${reasonTag}: ${err?.status || err?.message}). Retrying once with '${nextModel}' (remainingBudgetMs=${postRemainingMs})...`
        );
        continue;
      }

      throw err;
    }
  }

  throw lastError || new Error("Failed to generate content within time budget.");
}
