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

export type UnverifiedClaimCategory =
  | "certificate"
  | "system_tool"
  | "exaggerated_title";

export interface UnverifiedClaim {
  category: UnverifiedClaimCategory;
  token: string;
}

const CLAIM_PLACEHOLDER_STRIP_REGEX = /\[(?:본인 수치 입력|해당 경험이 있다면 입력:[^\]]*)\]/g;

const KO_END =
  "(?=$|[^A-Za-z0-9가-힣]|은|는|이|가|을|를|와|과|의|에|도|만|로|으로|에서|부터|까지|처럼|보다|라고|이라는|이란)";

const CERTIFICATE_REGEX = new RegExp(
  `(?<![A-Za-z0-9])(?:TOEIC|TOPIK|OPIC|TOEFL)(?![A-Za-z0-9])|(?<![A-Za-z0-9가-힣])(?:컴퓨터활용능력(?:\\s*[12]급)?|컴활(?:\\s*[12]급)?|한국사능력검정시험(?:\\s*[1-6]급)?|한국사(?:\\s*[1-6]급)?|기록물관리\\s*전문요원(?:\\s*자격)?|정보처리기사|정보처리산업기사|사회조사분석사(?:\\s*[12]급)?|전산세무(?:\\s*[12]급)?|전산회계(?:\\s*[12]급)?|재경관리사|워드프로세서|토익|오픽|토플|공인노무사|공인회계사|세무사|[가-힣A-Za-z]{2,12}(?:산업기사|기술사|기능사|자격증|면허증))${KO_END}|(?<![A-Za-z0-9가-힣])(?!신문기사|보도기사|특집기사|속보기사|기획기사|운전기사|배달기사|택배기사|대리기사)[가-힣]{2,10}기사${KO_END}`,
  "gi"
);

const SYSTEM_TOOL_REGEX = new RegExp(
  `(?<![A-Za-z0-9])(?:RMS|ERP|SAP|MySQL|PostgreSQL|SQL|Oracle|Python|SPSS|SAS|Power\\s*BI|Tableau|AutoCAD|HRIS|CRM|MES|WMS|LMS|AWS|Docker|Kubernetes|TypeScript|JavaScript|React|Excel|VBA)(?![A-Za-z0-9])|(?<![A-Za-z0-9가-힣])(?:파이썬|태블로|오토캐드|엑셀|매크로)${KO_END}`,
  "gi"
);

const EXAGGERATED_TITLE_REGEX = new RegExp(
  `(?<![A-Za-z0-9])(?:PM|PL|Tech\\s*Lead)(?![A-Za-z0-9])|(?<![A-Za-z0-9가-힣])(?:총괄(?:\\s*(?:책임자|매니저|담당자?|팀장|리더|리드))?|팀장|파트장|본부장|실장|센터장|프로젝트\\s*(?:리더|리드|매니저|총괄|책임자)|리드(?:\\s*(?:역할|담당|업무|직책|포지션|경험))?)${KO_END}`,
  "gi"
);

function normalizeClaimKey(category: UnverifiedClaimCategory, token: string): string {
  return `${category}:${token.toLowerCase().replace(/\s+/g, "")}`;
}

function extractVerifiedClaimKeys(sourceText: string): Set<string> {
  const keys = new Set<string>();
  if (typeof sourceText !== "string" || !sourceText.trim()) {
    return keys;
  }

  const addMatches = (category: UnverifiedClaimCategory, regex: RegExp) => {
    const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
    const clone = new RegExp(regex.source, flags);
    let match: RegExpExecArray | null;
    while ((match = clone.exec(sourceText)) !== null) {
      keys.add(normalizeClaimKey(category, match[0]));
      // 원문에 "총괄했다/총괄"이 있으면 관련 직책 표기도 허용 키로 등록
      if (category === "exaggerated_title" && match[0].startsWith("총괄")) {
        keys.add("exaggerated_title:총괄");
      }
      // 원문에 "컴퓨터활용능력"이 있으면 약칭 "컴활"도 허용, 그 반대도 허용
      if (category === "certificate") {
        const compact = match[0].toLowerCase().replace(/\s+/g, "");
        if (compact.includes("컴퓨터활용능력")) keys.add("certificate:컴활");
        if (compact.includes("컴활")) keys.add("certificate:컴퓨터활용능력");
        if (compact.includes("한국사")) keys.add("certificate:한국사");
      }
    }
  };

  addMatches("certificate", CERTIFICATE_REGEX);
  addMatches("system_tool", SYSTEM_TOOL_REGEX);
  addMatches("exaggerated_title", EXAGGERATED_TITLE_REGEX);
  return keys;
}

function scanMaskedGeneratedClaims(
  maskedText: string,
  allowedKeys: Set<string>
): Array<{ category: UnverifiedClaimCategory; token: string; index: number; length: number }> {
  const hits: Array<{ category: UnverifiedClaimCategory; token: string; index: number; length: number }> = [];
  const check = (category: UnverifiedClaimCategory, regex: RegExp) => {
    const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
    const clone = new RegExp(regex.source, flags);
    let m: RegExpExecArray | null;
    while ((m = clone.exec(maskedText)) !== null) {
      const token = m[0];
      const key = normalizeClaimKey(category, token);
      const hasPartialAllowed =
        allowedKeys.has(key) ||
        (category === "exaggerated_title" &&
          token.startsWith("총괄") &&
          allowedKeys.has("exaggerated_title:총괄")) ||
        (category === "certificate" &&
          ((token.includes("컴활") && allowedKeys.has("certificate:컴활")) ||
            (token.includes("한국사") && allowedKeys.has("certificate:한국사"))));
      if (!hasPartialAllowed) {
        hits.push({ category, token, index: m.index, length: token.length });
      }
    }
  };

  check("certificate", CERTIFICATE_REGEX);
  check("system_tool", SYSTEM_TOOL_REGEX);
  check("exaggerated_title", EXAGGERATED_TITLE_REGEX);

  hits.sort((a, b) => a.index - b.index || b.length - a.length);
  const deduped: typeof hits = [];
  let lastEnd = -1;
  for (const h of hits) {
    if (h.index < lastEnd) continue;
    deduped.push(h);
    lastEnd = h.index + h.length;
  }

  // 공백으로 이어진 동일 범주의 연속 툴/직책 표현(예: "엑셀 VBA 매크로")을 하나의 깔끔한 자리표시로 병합
  const merged: typeof hits = [];
  for (const h of deduped) {
    const prev = merged[merged.length - 1];
    if (prev && prev.category === h.category) {
      const gap = maskedText.slice(prev.index + prev.length, h.index);
      if (/^[ \t·/]+$/.test(gap)) {
        const nextEnd = h.index + h.length;
        prev.token = maskedText.slice(prev.index, nextEnd);
        prev.length = nextEnd - prev.index;
        continue;
      }
    }
    merged.push({ ...h });
  }
  return merged;
}

/**
 * 지원자 원문에 존재하지 않는 자격증명·전문 시스템/툴·과장 직책을 탐지해 반환
 * (이미 [해당 경험이 있다면 입력: ...] / [본인 수치 입력] 자리표시 내부에 포함된 예시는 오탐 제외)
 */
export function findUnverifiedClaims(
  generatedText: string,
  sourceText: string
): UnverifiedClaim[] {
  if (typeof generatedText !== "string" || !generatedText) {
    return [];
  }
  const masked = generatedText.replace(CLAIM_PLACEHOLDER_STRIP_REGEX, (m) =>
    " ".repeat(m.length)
  );
  const allowedKeys = extractVerifiedClaimKeys(sourceText);
  return scanMaskedGeneratedClaims(masked, allowedKeys).map(({ category, token }) => ({
    category,
    token,
  }));
}

/**
 * 지원자 원문에 존재하지 않는 자격증·전문 툴/시스템·과장 직책을
 * `[해당 경험이 있다면 입력: 예) ...]` 자리표시로 자동 치환
 */
export function sanitizeUnverifiedClaims(
  generatedText: string,
  sourceText: string
): string {
  if (typeof generatedText !== "string" || !generatedText) {
    return "";
  }
  const masked = generatedText.replace(CLAIM_PLACEHOLDER_STRIP_REGEX, (m) =>
    " ".repeat(m.length)
  );
  const allowedKeys = extractVerifiedClaimKeys(sourceText);
  const hits = scanMaskedGeneratedClaims(masked, allowedKeys);
  if (hits.length === 0) {
    return generatedText;
  }

  let out = "";
  let cursor = 0;
  for (const hit of hits) {
    out += generatedText.slice(cursor, hit.index);
    const labelHint =
      hit.category === "certificate"
        ? `${hit.token} 보유 및 활용 경험`
        : hit.category === "system_tool"
          ? `${hit.token} 활용 경험`
          : `${hit.token} 역할 수행 경험`;
    out += `[해당 경험이 있다면 입력: 예) ${labelHint}]`;
    cursor = hit.index + hit.length;
  }
  out += generatedText.slice(cursor);
  return out;
}

/**
 * 수치 + 미검증 자격증·시스템/툴·과장 직책 일괄 후처리 차단
 */
export function sanitizeUnverifiedResumeText(
  generatedText: string,
  sourceText: string
): string {
  const numClean = sanitizeUnverifiedNumbers(generatedText, sourceText);
  return sanitizeUnverifiedClaims(numClean, sourceText);
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
