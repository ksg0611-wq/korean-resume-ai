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
