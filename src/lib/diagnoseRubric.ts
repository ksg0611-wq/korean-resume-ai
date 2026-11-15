import { countResumeMetrics, type TextMetrics } from "./textMetrics";
import { detectBlindViolations, type BlindCheckResult } from "./blindCheck";

export interface CategoryScore {
  key: "star" | "metrics_role" | "alignment" | "blind" | "length";
  name: string;
  score: number;
  maxScore: number;
  label: string; // "양호", "보통", "개선 필요"
  feedback: string;
}

export interface WeaknessItem {
  id: string;
  categoryKey: string;
  title: string;
  severity: "high" | "medium";
  description?: string;
  isLocked?: boolean;
}

export interface SampleFix {
  title: string;
  beforeExcerpt: string;
  afterExample: string;
  tip: string;
}

/** 전체 진단 내부 데이터 (서버 보관/유료 잠금해제용) */
export interface FullDiagnosticReport {
  totalScore: number;
  grade: "S" | "A" | "B" | "C" | "D";
  summary: string;
  categories: CategoryScore[];
  metrics: TextMetrics;
  blindCheck: BlindCheckResult;
  totalWeaknessCount: number;
  weaknesses: WeaknessItem[];
  sampleFix: SampleFix;
}

/** 무료 사용자에게 반환되는 필터링된 응답 (서버 레벨 잠금 차단) */
export interface FreeDiagnosticResponse {
  isFree: true;
  totalScore: number;
  grade: "S" | "A" | "B" | "C" | "D";
  summary: string;
  categories: Array<{
    key: string;
    name: string;
    score: number;
    maxScore: number;
    label: string;
  }>;
  metrics: {
    charCount: number;
    charCountNoSpaces: number;
    byteCount2B: number;
    targetChars: number;
    fillRatio: number;
    metricCount: number;
  };
  blindSummary: {
    clean: boolean;
    totalViolations: number;
    isLocked: true;
  };
  totalWeaknessCount: number;
  topWeaknesses: WeaknessItem[]; // 상세 설명 포함 2건
  lockedWeaknesses: Array<{
    id: string;
    categoryKey: string;
    title: string;
    severity: "high" | "medium";
    isLocked: true;
  }>; // 항목명/심각도만 포함, 설명 제외
  sampleFix: SampleFix; // 수정 예시 1건
}

/** LLM이 채점하는 보조 앵커 구조 */
export interface AIAnchorEvaluation {
  star: {
    s: number; // 0, 2, 4, 6
    t: number; // 0, 2, 4, 6
    a: number; // 0, 3, 5, 7
    r: number; // 0, 2, 4, 6
    feedback: string;
  };
  metricsRole: {
    roleScore: number; // 0, 3, 5, 8
    specificityScore: number; // 0, 2, 4, 7
    feedback: string;
  };
  alignment: {
    score: number; // 6, 11, 16, 20
    feedback: string;
  };
  weaknesses: Array<{
    categoryKey: string;
    title: string;
    severity: "high" | "medium";
    description: string;
  }>;
  sampleFix: {
    title: string;
    beforeExcerpt: string;
    afterExample: string;
    tip: string;
  };
}

/**
 * 글자수 점수 산출 (15점 만점, 순수 규칙 기반)
 */
export function calculateLengthScore(charCount: number, targetChars: number = 700): {
  score: number;
  label: string;
  feedback: string;
} {
  const safeTarget = Math.max(100, targetChars || 700);
  const ratio = charCount / safeTarget;
  if (ratio >= 0.80 && ratio <= 1.10) {
    return {
      score: 15,
      label: "적정",
      feedback: `목표 글자수(${safeTarget}자)의 ${(ratio * 100).toFixed(0)}%로 매우 적절한 분량입니다.`,
    };
  }
  if ((ratio >= 0.65 && ratio < 0.80) || (ratio > 1.10 && ratio <= 1.25)) {
    return {
      score: 11,
      label: "양호",
      feedback: `목표 글자수(${safeTarget}자) 대비 다소 ${ratio < 0.80 ? "부족" : "초과"}하여 추가 조율이 권장됩니다.`,
    };
  }
  if ((ratio >= 0.45 && ratio < 0.65) || (ratio > 1.25 && ratio <= 1.40)) {
    return {
      score: 7,
      label: "개선 필요",
      feedback: `글자수 충족률이 ${(ratio * 100).toFixed(0)}%로 성의 부족 또는 분량 초과 감점 위험이 있습니다.`,
    };
  }
  return {
    score: 4,
    label: "심각",
    feedback: `목표 글자수와 큰 차이가 납니다 (현재 ${charCount}자 / 목표 ${safeTarget}자).`,
  };
}

/**
 * 블라인드 위반 점수 산출 (15점 만점, 순수 규칙 기반)
 */
export function calculateBlindScore(blindResult: BlindCheckResult): {
  score: number;
  label: string;
  feedback: string;
} {
  const count = blindResult.totalViolations;
  if (count === 0) {
    return {
      score: 15,
      label: "준수",
      feedback: "학교명·출신지·가족 등 블라인드 위반 키워드가 탐지되지 않았습니다.",
    };
  }
  if (count === 1) {
    return {
      score: 9,
      label: "주의",
      feedback: "블라인드 위반 의심 표현이 1건 탐지되었습니다. 서류 검토 시 감점 요인이 될 수 있습니다.",
    };
  }
  if (count === 2) {
    return {
      score: 4,
      label: "위험",
      feedback: "블라인드 위반 표현이 2건 발견되어 심사위원 감점 가능성이 높습니다.",
    };
  }
  return {
    score: 0,
    label: "실격 위험",
    feedback: "3건 이상의 블라인드 규정 위반이 확인되어 서류 탈락 위험이 매우 큽니다.",
  };
}

/**
 * 수치 점수 규칙 부분 (10점)
 */
export function calculateMetricTokenScore(metricCount: number): number {
  if (metricCount >= 3) return 10;
  if (metricCount >= 1) return 6;
  return 2;
}

/**
 * 점수 합산 및 등급 판정
 */
export function determineGrade(score: number): "S" | "A" | "B" | "C" | "D" {
  if (score >= 90) return "S";
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  return "D";
}

/**
 * 규칙 기반 + AI 보조 앵커를 결합한 최종 진단 리포트 생성
 */
export function buildDiagnosticReport(
  text: string,
  targetChars: number = 700,
  aiEval: AIAnchorEvaluation
): FullDiagnosticReport {
  const metrics = countResumeMetrics(text, targetChars);
  const blindCheck = detectBlindViolations(text);

  // 1. STAR 구조 (25점 만점)
  const starS = Math.min(6, Math.max(0, Number(aiEval.star?.s) || 0));
  const starT = Math.min(6, Math.max(0, Number(aiEval.star?.t) || 0));
  const starA = Math.min(7, Math.max(0, Number(aiEval.star?.a) || 0));
  const starR = Math.min(6, Math.max(0, Number(aiEval.star?.r) || 0));
  const starScore = starS + starT + starA + starR;

  // 2. 수치 및 역할 구체성 (25점 만점: 규칙 10점 + AI 앵커 15점)
  const metricRuleScore = calculateMetricTokenScore(metrics.metricCount);
  const roleScore = Math.min(8, Math.max(0, Number(aiEval.metricsRole?.roleScore) || 0));
  const specScore = Math.min(7, Math.max(0, Number(aiEval.metricsRole?.specificityScore) || 0));
  const metricsRoleTotal = metricRuleScore + roleScore + specScore;

  // 3. 문항 적합성 (20점 만점)
  const alignScore = Math.min(20, Math.max(0, Number(aiEval.alignment?.score) || 11));

  // 4. 블라인드 위반 (15점 만점, 규칙 기반)
  const blindEval = calculateBlindScore(blindCheck);

  // 5. 글자수 기준 (15점 만점, 규칙 기반)
  const lengthEval = calculateLengthScore(metrics.charCount, targetChars);

  // 총점 계산 (0~100)
  const totalScore = Math.min(
    100,
    Math.max(0, Math.round(starScore + metricsRoleTotal + alignScore + blindEval.score + lengthEval.score))
  );

  const grade = determineGrade(totalScore);

  const categories: CategoryScore[] = [
    {
      key: "star",
      name: "STAR 프레임워크",
      score: starScore,
      maxScore: 25,
      label: starScore >= 20 ? "우수" : starScore >= 14 ? "보통" : "개선 필요",
      feedback:
        aiEval.star?.feedback ||
        "상황(S)·과제(T)·행동(A)·결과(R)의 흐름이 고르게 배치되었는지 검토되었습니다.",
    },
    {
      key: "metrics_role",
      name: "수치·역할 구체성",
      score: metricsRoleTotal,
      maxScore: 25,
      label: metricsRoleTotal >= 20 ? "우수" : metricsRoleTotal >= 14 ? "보통" : "개선 필요",
      feedback:
        aiEval.metricsRole?.feedback ||
        `정량 수치(${metrics.metricCount}건 발견) 및 본인 고유 기여도가 구체적으로 드러나는지 평가되었습니다.`,
    },
    {
      key: "alignment",
      name: "직무/문항 적합성",
      score: alignScore,
      maxScore: 20,
      label: alignScore >= 16 ? "우수" : alignScore >= 11 ? "보통" : "개선 필요",
      feedback:
        aiEval.alignment?.feedback ||
        "지원 직무에서 요구하는 핵심 역량 및 문항 의도와의 일치도를 분석했습니다.",
    },
    {
      key: "blind",
      name: "블라인드 규정 준수",
      score: blindEval.score,
      maxScore: 15,
      label: blindEval.label,
      feedback: blindEval.feedback,
    },
    {
      key: "length",
      name: "글자수/분량 적정성",
      score: lengthEval.score,
      maxScore: 15,
      label: lengthEval.label,
      feedback: lengthEval.feedback,
    },
  ];

  // 약점 목록 생성 (블라인드 세부 위치 유출 차단을 위해 AI가 생성한 블라인드 중복/위치 설명은 서버에서 필터링)
  const BLIND_LEAK_HINT_RE = /블라인드|학력|학교명|대학명|가족\s*직업|출신지|출신\s*지역/i;
  const weaknesses: WeaknessItem[] = (aiEval.weaknesses || [])
    .filter((w) => {
      const cat = String(w.categoryKey || "").toLowerCase();
      if (cat.includes("blind")) return false;
      if (BLIND_LEAK_HINT_RE.test(String(w.title || ""))) return false;
      return true;
    })
    .map((w, idx) => ({
      id: `wk-${idx + 1}`,
      categoryKey: w.categoryKey || "general",
      title: w.title,
      severity: w.severity === "high" ? "high" : "medium",
      description: w.description,
    }));

  // 블라인드 위반이 있는 경우 최우선 약점으로 자동 보강 (특정 단어/위치는 비공개)
  if (!blindCheck.clean) {
    weaknesses.unshift({
      id: "wk-blind",
      categoryKey: "blind",
      title: `블라인드 채용 위반 의심 표현 ${blindCheck.totalViolations}건 발견`,
      severity: "high",
      description:
        "규정 위반 의심 표현이 포함되어 있어 서류 전형 감점 또는 결격 사유가 될 수 있습니다. 정확한 위반 위치와 대체 표현은 완성본에서 안전하게 교정됩니다.",
    });
  }

  // 글자수 충족률이 낮은 경우 약점 추가
  if (lengthEval.score <= 7) {
    weaknesses.push({
      id: "wk-length",
      categoryKey: "length",
      title: `목표 분량 대비 글자수 부적합 (${metrics.charCount}자 / 목표 ${targetChars}자)`,
      severity: lengthEval.score <= 3 ? "high" : "medium",
      description: lengthEval.feedback,
    });
  }

  const sampleFix: SampleFix = aiEval.sampleFix || {
    title: "구체적 행동과 정량 성과 보강",
    beforeExcerpt: text.slice(0, 100),
    afterExample:
      "팀 프로젝트에서 발생한 결제 이탈 문제를 해결하기 위해 캐싱 로직을 도입하여 로딩 시간을 1.2초 단축하고 완료율을 18% 개선했습니다.",
    tip: "본인의 주도적 행동과 숫자로 입증되는 성과를 연결해 서술하세요.",
  };

  // 약점 정렬: 블라인드 위반 최우선, 그 다음 high -> medium 순
  weaknesses.sort((a, b) => {
    if (a.id === "wk-blind") return -1;
    if (b.id === "wk-blind") return 1;
    if (a.severity === b.severity) return 0;
    return a.severity === "high" ? -1 : 1;
  });

  const summary =
    totalScore >= 80
      ? "전반적으로 우수한 구조를 갖추고 있으나 일부 표현과 수치 보강으로 서류 합격률을 더 끌어올릴 수 있습니다."
      : totalScore >= 60
        ? "기본 경험 소재는 명확하지만 STAR 전개 구체성과 정량적 기여도 보완이 필수적인 상태입니다."
        : "핵심 과제와 본인 역할이 모호하고 분량·형식 조정이 시급하여 전면 재구조화가 필요합니다.";

  return {
    totalScore,
    grade,
    summary,
    categories,
    metrics,
    blindCheck,
    totalWeaknessCount: weaknesses.length,
    weaknesses,
    sampleFix,
  };
}

/**
 * 무료 응답용 서버 레벨 데이터 필터링
 * - topWeaknesses: 심각도 높은 상위 2건만 description 포함
 * - lockedWeaknesses: 3번째 이후 약점은 title/severity만 남기고 description 제거
 * - blindSummary: 위반 건수만 반환, 상세 매칭 텍스트/인덱스는 네트워크 응답에서 완전 제거
 */
export function buildFreeDiagnosticResponse(
  full: FullDiagnosticReport
): FreeDiagnosticResponse {
  const topWeaknesses = full.weaknesses.slice(0, 2);
  const lockedWeaknesses = full.weaknesses.slice(2).map((w) => ({
    id: w.id,
    categoryKey: w.categoryKey,
    title: w.title,
    severity: w.severity,
    isLocked: true as const,
  }));

  return {
    isFree: true,
    totalScore: full.totalScore,
    grade: full.grade,
    summary: full.summary,
    categories: full.categories.map((c) => ({
      key: c.key,
      name: c.name,
      score: c.score,
      maxScore: c.maxScore,
      label: c.label,
    })),
    metrics: {
      charCount: full.metrics.charCount,
      charCountNoSpaces: full.metrics.charCountNoSpaces,
      byteCount2B: full.metrics.byteCount2B,
      targetChars: full.metrics.targetChars,
      fillRatio: full.metrics.fillRatio,
      metricCount: full.metrics.metricCount,
    },
    blindSummary: {
      clean: full.blindCheck.clean,
      totalViolations: full.blindCheck.totalViolations,
      isLocked: true,
    },
    totalWeaknessCount: full.totalWeaknessCount,
    topWeaknesses,
    lockedWeaknesses,
    sampleFix: full.sampleFix,
  };
}
