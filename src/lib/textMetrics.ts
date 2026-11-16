/**
 * 자소서 글자수, 바이트수, 정량 수치 메트릭 계산 유틸리티
 */

export interface TextMetrics {
  /** 공백 포함 글자수 */
  charCount: number;
  /** 공백 제외 글자수 */
  charCountNoSpaces: number;
  /**
   * 공공기관 및 일반 기업 채용 시스템 표준 2바이트 계산
   * (한글·전각 문자 = 2byte, 영문·숫자·반각 기호·공백·줄바꿈 = 1byte)
   */
  byteCount2B: number;
  /** UTF-8 기준 바이트수 (한글 3byte) */
  byteCountUtf8: number;
  /** 목표 글자수 */
  targetChars: number;
  /** 목표 글자수 충족률 (0.0 ~ ) */
  fillRatio: number;
  /** 발견된 정량적 수치 표현 목록 */
  metricTokens: string[];
  /** 정량적 수치 표현 개수 */
  metricCount: number;
}

/**
 * 표준 2바이트(한글 2B / ASCII 1B) 계산
 */
export function calculate2ByteLength(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // 한글 및 유니코드 다국어/전각 (0x80 이상)
    if (code > 127) {
      bytes += 2;
    } else {
      bytes += 1;
    }
  }
  return bytes;
}

/**
 * UTF-8 바이트 계산
 */
export function calculateUtf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * 정량적 성과/수치 토큰 정규식
 * 예: 25%, 3명, 50건, 4,900원, 2배, 12시간, 3개월, 1년, 10개, 4.2점 등
 */
const QUANTITATIVE_REGEX =
  /(?:\d+(?:,\d+)*(?:\.\d+)?)\s*(?:%|퍼센트|명|건|원|만원|억원|배|개|회|차례|시간|분|초|일간?|주간?|개월|년(?:간)?|점|위|등|단계|배)/g;

/**
 * 자소서 텍스트 분석 메트릭 추출
 */
export function countResumeMetrics(text: string, targetChars: number = 700): TextMetrics {
  const safeText = typeof text === "string" ? text : "";
  const charCount = safeText.length;
  const charCountNoSpaces = safeText.replace(/\s/g, "").length;
  const byteCount2B = calculate2ByteLength(safeText);
  const byteCountUtf8 = calculateUtf8ByteLength(safeText);

  const matched = safeText.match(QUANTITATIVE_REGEX) || [];
  // 중복 정리
  const metricTokens = Array.from(new Set(matched.map((m) => m.trim())));

  const safeTarget = Math.max(100, targetChars || 700);
  const fillRatio = safeTarget > 0 ? Number((charCount / safeTarget).toFixed(3)) : 0;

  return {
    charCount,
    charCountNoSpaces,
    byteCount2B,
    byteCountUtf8,
    targetChars: safeTarget,
    fillRatio,
    metricTokens,
    metricCount: metricTokens.length,
  };
}

/**
 * 성과·정량 수치 후처리 검사 대상 정규식
 * - %, %p, 퍼센트, 원, 천/만/억/조(원/명/건/배/시간), 건, 명, 배, 시간, Zero/제로 매칭
 * - "3가지", "2단계", "1번", "4문항", "5급", "2026년" 등 일반 문장 구조 숫자는 제외
 * - "실제로", "문제로"처럼 앞뒤에 한글/영문이 붙은 단어 내부 "제로"는 제외
 */
const UNVERIFIED_QUANT_REGEX =
  /(?:\d+(?:,\d+)*(?:\.\d+)?)[ \t]*(?:(?:천|만|억|조)[ \t]*(?:여[ \t]*)?(?:원|명|건|배|시간)?|%p?|퍼센트(?:포인트)?|(?:여[ \t]*)?(?:원|건|명|배|시간))|(?<![A-Za-z0-9가-힣])(?:Zero|ZERO|zero|제로(?:[ \t]*(?:원|건|명|배|시간|%))?)(?![A-Za-z0-9가-힣])/g;

export const UNVERIFIED_METRIC_PLACEHOLDER = "[본인 수치 입력]";

function normalizeQuantKey(rawToken: string): string {
  return rawToken
    .toLowerCase()
    .replace(/,/g, "")
    .replace(/[ \t]+/g, "")
    .replace(/퍼센트포인트/g, "%p")
    .replace(/퍼센트/g, "%")
    .replace(/^제로/, "zero")
    .replace(/(천|만|억|조)여/g, "$1")
    .replace(/(\d)여(원|명|건|배|시간)/g, "$1$2");
}

function extractVerifiedQuantKeys(sourceText: string): Set<string> {
  const keys = new Set<string>();
  if (typeof sourceText !== "string" || !sourceText.trim()) {
    return keys;
  }
  const matches = sourceText.match(UNVERIFIED_QUANT_REGEX) || [];
  for (const m of matches) {
    keys.add(normalizeQuantKey(m));
  }
  return keys;
}

/**
 * 사용자 입력 원문에 존재하지 않는 성과·정량 수치를 탐지해 반환
 */
export function findUnverifiedMetrics(generatedText: string, sourceText: string): string[] {
  if (typeof generatedText !== "string" || !generatedText) {
    return [];
  }
  const allowedKeys = extractVerifiedQuantKeys(sourceText);
  const found = generatedText.match(UNVERIFIED_QUANT_REGEX) || [];
  return found.filter((token) => !allowedKeys.has(normalizeQuantKey(token)));
}

/**
 * 사용자 입력 원문에 존재하지 않는 성과·정량 수치를 [본인 수치 입력]으로 자동 치환
 */
export function sanitizeUnverifiedNumbers(generatedText: string, sourceText: string): string {
  if (typeof generatedText !== "string" || !generatedText) {
    return "";
  }
  const allowedKeys = extractVerifiedQuantKeys(sourceText);
  return generatedText.replace(UNVERIFIED_QUANT_REGEX, (match) => {
    if (allowedKeys.has(normalizeQuantKey(match))) {
      return match;
    }
    return UNVERIFIED_METRIC_PLACEHOLDER;
  });
}

const QUESTION_METRIC_PHRASE_REGEX = new RegExp(
  `(?:(?:약|대략|최대|최소|거의)[ \\t]+)?(${UNVERIFIED_QUANT_REGEX.source})(?:[ \\t]*(?:여|가량|정도|이상|이하|미만|초과|가까이|넘게|안팎|남짓))?`,
  "g"
);

function inferQualitativeMetricPhrase(coreToken: string, afterText: string): string {
  const trimmed = coreToken.trim();
  if (/^(?:zero|제로)/i.test(trimmed)) {
    return "전무한 수준";
  }
  if (/시간$/.test(trimmed)) {
    return "상당한 시간";
  }
  if (/배$/.test(trimmed)) {
    if (/^(?:으로|이|을|은)/.test(afterText)) {
      return "상당 수준";
    }
    if (/^[로가를는의에와과]/.test(afterText)) {
      return "여러 배";
    }
    return "크게";
  }
  if (/(?:%p?|퍼센트(?:포인트)?)$/.test(trimmed)) {
    return "상당 수준";
  }
  if (/원$/.test(trimmed)) {
    return "상당 금액";
  }
  if (/건$/.test(trimmed)) {
    return "여러 건";
  }
  if (/명$/.test(trimmed)) {
    return "여러 명";
  }
  return "상당 규모";
}

/**
 * 면접 질문(15Q/3Q)·의도 문구 전용 수치 후처리 가드:
 * - [본인 수치 입력] 대괄호 표기를 절대 삽입하지 않고 자연스러운 한국어 정성 표현으로 대체
 * - 자소서 원문에 존재하는 검증된 수치는 그대로 유지
 */
export function sanitizeInterviewQuestionText(
  questionText: string,
  sourceText: string
): string {
  if (typeof questionText !== "string" || !questionText) {
    return "";
  }
  const allowedKeys = extractVerifiedQuantKeys(sourceText);
  const replaced = questionText.replace(
    QUESTION_METRIC_PHRASE_REGEX,
    (fullMatch, coreToken: string, offset: number, fullString: string) => {
      if (allowedKeys.has(normalizeQuantKey(coreToken))) {
        return fullMatch;
      }
      const afterText = fullString.slice(offset + fullMatch.length);
      return inferQualitativeMetricPhrase(coreToken, afterText);
    }
  );
  return replaced
    .replace(/\[본인 수치 입력\]/g, "상당 수준")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
