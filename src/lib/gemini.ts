import {
  GoogleGenerativeAI,
  type GenerationConfig,
  type UsageMetadata,
} from "@google/generative-ai";

export type ThinkingLevel = "minimal" | "low" | "medium" | "high";

/**
 * 서비스 전역 Gemini 모델 및 추론 강도 공통 설정
 * 자소서 생성 API(/api/generate)와 면접 꼬리질문 API(/api/interview/generate)가 동일 사양을 참조
 */
export const GEMINI_CONFIG = {
  PRIMARY_MODEL: "gemini-3.8-flash",
  FALLBACK_MODEL: "gemini-3.7-flash",
  THINKING_LEVEL: "medium" as ThinkingLevel,
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
  usage: {
    promptTokens: number;
    completionTokens: number;
    thinkingTokens: number;
    totalTokens: number;
  };
}

/**
 * 404, 403, 모델 미승인/미존재 에러 감지 헬퍼
 * (타임아웃 및 429 할당량 초과는 폴백 대상에서 엄격히 제외)
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

/**
 * 최신 Flash 모델 호출 및 투명한 폴백 실행
 * 1) [MODEL_FALLBACK] 콘솔 경고 명시적 출력
 * 2) 실제 호출 성공한 modelId 반환
 * 3) 오직 모델 미승인/미존재(404, 403) 오류 시에만 하위 모델로 전환 (gemini-3.8-flash -> gemini-3.7-flash 2개 모델 한정)
 */
export async function generateContentWithFallback(
  genAI: GoogleGenerativeAI,
  prompt: string,
  preferredModel: string = GEMINI_CONFIG.PRIMARY_MODEL,
  thinkingLevel: ThinkingLevel = GEMINI_CONFIG.THINKING_LEVEL
): Promise<GenerateResult> {
  const candidateModels = [
    preferredModel,
    GEMINI_CONFIG.FALLBACK_MODEL,
  ];

  // 중복 제거
  const modelsToTry = Array.from(new Set(candidateModels));
  const generationConfig: ThinkingGenerationConfig = {
    thinkingConfig: {
      thinkingLevel,
    },
  };

  let lastError: any = null;

  for (let i = 0; i < modelsToTry.length; i++) {
    const currentModelName = modelsToTry[i];
    try {
      const model = genAI.getGenerativeModel({
        model: currentModelName,
        generationConfig,
      });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const usage = result.response.usageMetadata as ExtendedUsageMetadata | undefined;

      return {
        text,
        usedModel: currentModelName,
        thinkingLevel,
        usage: {
          promptTokens: usage?.promptTokenCount ?? 0,
          completionTokens: usage?.candidatesTokenCount ?? 0,
          thinkingTokens: usage?.thoughtsTokenCount ?? 0,
          totalTokens: usage?.totalTokenCount ?? 0,
        },
      };
    } catch (err: any) {
      lastError = err;

      // 오직 모델 미존재/미지원(404, 403) 시에만 다음 하위 모델로 폴백
      if (isModelNotAvailableError(err) && i < modelsToTry.length - 1) {
        const nextModel = modelsToTry[i + 1];
        console.warn(
          `[MODEL_FALLBACK] Model '${currentModelName}' failed with model-availability error (${err.status || err.message}). Automatically switching to next candidate '${nextModel}'...`
        );
        continue;
      }

      // 429 할당량 초과, 타임아웃, 네트워크 오류 등은 폴백하지 않고 즉시 throw
      throw err;
    }
  }

  throw lastError || new Error("Failed to generate content with available models.");
}
