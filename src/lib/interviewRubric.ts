import {
  countResumeMetrics,
  sanitizeUnverifiedNumbers,
  UNVERIFIED_METRIC_PLACEHOLDER,
} from "./textMetrics";

export const NCS_COMPETENCIES = [
  "의사소통능력",
  "수리능력",
  "문제해결능력",
  "자기개발능력",
  "자원관리능력",
  "대인관계능력",
  "정보능력",
  "기술능력",
  "조직이해능력",
  "직업윤리",
] as const;

export type NcsCompetency = (typeof NCS_COMPETENCIES)[number];

export const INTERVIEW_JOB_CATEGORIES = [
  {
    value: "공공기관 경영·회계·사무",
    label: "공공기관 경영·회계·사무 (일반행정·기획·재무)",
    roleDescription:
      "공기업·준정부기관 경영·회계·일반행정 직무 실무 면접관(NCS 직업기초능력·공공기관 규정 준수 중심)",
  },
  {
    value: "공기업 기술·전산·데이터(NCS)",
    label: "공기업 기술·전산·데이터 (NCS 기술·정보·안전)",
    roleDescription:
      "공기업·공공기관 전산·데이터·기술직 실무 면접관(시스템 안정성·보안·NCS 기술능력 검증 중심)",
  },
  {
    value: "공공서비스·민원·기획",
    label: "공공서비스·민원·정책기획 (대민·사업관리)",
    roleDescription:
      "공공서비스 운영·대민 행정·정책사업 기획 직무 면접관(공익성·민원 대응·예산 집행 검증 중심)",
  },
  {
    value: "IT / 개발",
    label: "IT / 개발 (소프트웨어·인프라)",
    roleDescription:
      "소프트웨어 엔지니어링·데이터·IT 인프라 직군 실무 면접관",
  },
  {
    value: "마케팅 / 홍보",
    label: "마케팅 / 홍보 (대국민 홍보·브랜드·콘텐츠)",
    roleDescription:
      "공공 홍보·콘텐츠·퍼포먼스 마케팅 직군 실무 면접관",
  },
  {
    value: "기타 직무",
    label: "기타 직무 (연구·시설·전문직 등)",
    roleDescription:
      "공공기관 및 일반기업 인사(HR)·실무 종합 면접관",
  },
] as const;

export function resolveInterviewRoleDescription(rawJobCategory: string): string {
  const clean = rawJobCategory.trim();
  const exact = INTERVIEW_JOB_CATEGORIES.find((item) => item.value === clean);
  if (exact) return exact.roleDescription;

  switch (clean) {
    case "IT":
      return INTERVIEW_JOB_CATEGORIES[3].roleDescription;
    case "기획":
      return INTERVIEW_JOB_CATEGORIES[2].roleDescription;
    case "마케팅":
      return INTERVIEW_JOB_CATEGORIES[4].roleDescription;
    case "기타":
      return INTERVIEW_JOB_CATEGORIES[5].roleDescription;
    default:
      return `${clean} 직무 공공기관·실무 면접관(NCS 직업기초능력 중심)`;
  }
}

export function normalizeNcsCompetency(raw: unknown): NcsCompetency {
  const s = typeof raw === "string" ? raw.trim().replace(/\s+/g, "") : "";
  const exact = NCS_COMPETENCIES.find((tag) => tag === s);
  if (exact) return exact;

  if (s.includes("의사소통")) return "의사소통능력";
  if (s.includes("수리")) return "수리능력";
  if (s.includes("문제해결")) return "문제해결능력";
  if (s.includes("자기개발") || s.includes("자기계발")) return "자기개발능력";
  if (s.includes("자원관리")) return "자원관리능력";
  if (s.includes("대인관계") || s.includes("협업") || s.includes("갈등")) return "대인관계능력";
  if (s.includes("정보")) return "정보능력";
  if (s.includes("기술")) return "기술능력";
  if (s.includes("조직이해")) return "조직이해능력";
  if (s.includes("윤리") || s.includes("청렴") || s.includes("공직")) return "직업윤리";
  return "문제해결능력";
}

export type InterviewQuestionKind = "job" | "personality" | "self_intro";

export interface SimulatorQuestion {
  id: string;
  number: number;
  kind: InterviewQuestionKind;
  ncsCompetency: NcsCompetency;
  intentSummary: string;
  question: string;
}

export interface ConsistencyMismatch {
  category: "역할" | "기여도" | "수치·기간" | "경험 사실";
  resumeQuote: string;
  answerQuote: string;
  reason: string;
}

export interface ConsistencyEvaluation {
  applicable: boolean;
  statusLabel: "일관성 문제 없음" | "불일치 발견" | "해당 없음";
  score: number | null;
  maxScore: 15;
  summary: string;
  mismatches: ConsistencyMismatch[];
}

export interface InterviewCategoryScore {
  key: "star" | "metrics_role" | "alignment" | "conciseness" | "consistency";
  name: string;
  score: number | null;
  maxScore: number;
  label: string;
  applicable: boolean;
  feedback: string;
}

export interface FollowUpPrompt {
  depth: 1 | 2 | 3;
  ncsCompetency: NcsCompetency;
  focus: string;
  question: string;
}

export interface AnswerEvaluationReport {
  totalScore: number;
  rawScore85: number;
  consistencyApplied: boolean;
  scoreFormulaNote: string;
  grade: "S" | "A" | "B" | "C" | "D";
  charCount: number;
  estimatedSpeechSeconds: number;
  metricCount: number;
  categories: InterviewCategoryScore[];
  feedback3Lines: [string, string, string];
  digPoint: string;
  consistency: ConsistencyEvaluation;
  modelAnswer: string | null;
  modelAnswerLocked: boolean;
  nextFollowUp: FollowUpPrompt | null;
  nextFollowUpLocked: boolean;
}

export interface AIInterviewAnchorEvaluation {
  star: {
    s: number;
    t: number;
    a: number;
    r: number;
    feedback: string;
  };
  metricsRole: {
    roleScore: number;
    specificityScore: number;
    feedback: string;
  };
  alignment: {
    directAnswer: number;
    ncsCompetencyFit: number;
    feedback: string;
  };
  consistency: {
    applicable: boolean;
    sharesResumeExperience: boolean;
    score: number;
    hasInconsistency: boolean;
    summary: string;
    mismatches: Array<{
      category: string;
      resumeQuote: string;
      answerQuote: string;
      reason: string;
    }>;
  };
  feedback3Lines: string[];
  digPoint: string;
  modelAnswer: string;
  nextFollowUp?: {
    ncsCompetency: string;
    focus: string;
    question: string;
  } | null;
}

export function snapToInterviewAnchor(rawValue: unknown, anchors: readonly number[]): number {
  const num = Number(rawValue);
  if (!Number.isFinite(num)) {
    return anchors[Math.floor(anchors.length / 2)];
  }
  let best = anchors[0];
  let bestDist = Math.abs(num - best);
  for (const candidate of anchors) {
    const dist = Math.abs(num - candidate);
    if (dist < bestDist) {
      best = candidate;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * 간결성 점수 산출 (15점 만점, 100% 순수 규칙 기반)
 * - 일반/꼬리질문(100~800자): 250~550자(15점), 150~249·551~700자(11점), 그 외(7점)
 * - 1분 자기소개 대본(80~600자): 250~330자(15점, 약 48~63초), 200~249·331~400자(11점), 그 외(7점)
 */
export function calculateConcisenessScore(
  answerText: string,
  questionKind: InterviewQuestionKind = "job"
): {
  score: number;
  charCount: number;
  estimatedSpeechSeconds: number;
  label: string;
  feedback: string;
} {
  const charCount = answerText.trim().length;
  const estimatedSpeechSeconds = Math.max(1, Math.round(charCount / 5.2));

  if (questionKind === "self_intro") {
    if (charCount >= 250 && charCount <= 330) {
      return {
        score: 15,
        charCount,
        estimatedSpeechSeconds,
        label: "1분 적정",
        feedback: `1분 자기소개에 알맞은 분량(${charCount}자 · 예상 발화 약 ${estimatedSpeechSeconds}초)으로 핵심을 압축했습니다.`,
      };
    }
    if ((charCount >= 200 && charCount < 250) || (charCount > 330 && charCount <= 400)) {
      return {
        score: 11,
        charCount,
        estimatedSpeechSeconds,
        label: "보통",
        feedback:
          charCount < 250
            ? `분량(${charCount}자 · 약 ${estimatedSecondsStr(estimatedSpeechSeconds)})이 다소 짧아 핵심 경험 1문장 보강을 권장합니다 (250~330자 권장).`
            : `분량(${charCount}자 · 약 ${estimatedSecondsStr(estimatedSpeechSeconds)})이 다소 길어 1분(330자 이내) 내로 압축하면 전달력이 높아집니다.`,
      };
    }
    return {
      score: 7,
      charCount,
      estimatedSpeechSeconds,
      label: "개선 필요",
      feedback:
        charCount < 200
          ? `1분 자기소개 기준(${charCount}자 · 약 ${estimatedSecondsStr(estimatedSpeechSeconds)})보다 크게 짧습니다.`
          : `1분 발화 적정 분량(${charCount}자 · 약 ${estimatedSecondsStr(estimatedSpeechSeconds)})을 초과해 면접 집중도가 떨어질 수 있습니다.`,
    };
  }

  if (charCount >= 250 && charCount <= 550) {
    return {
      score: 15,
      charCount,
      estimatedSpeechSeconds,
      label: "적정",
      feedback: `구술 40~90초 내외에 알맞은 분량(${charCount}자)으로 핵심을 간결하게 전달했습니다.`,
    };
  }
  if ((charCount >= 150 && charCount < 250) || (charCount > 550 && charCount <= 700)) {
    return {
      score: 11,
      charCount,
      estimatedSpeechSeconds,
      label: "양호",
      feedback:
        charCount < 250
          ? `분량(${charCount}자)이 다소 짧아 행동 근거를 1~2문장 보충하면 설득력이 높아집니다.`
          : `분량(${charCount}자)이 다소 길어 결론 두괄식 위주로 500자 내외로 압축하는 것이 좋습니다.`,
    };
  }
  return {
    score: 7,
    charCount,
    estimatedSpeechSeconds,
    label: "개선 필요",
    feedback:
      charCount < 150
        ? `답변 분량(${charCount}자)이 매우 짧아 실무 검증에 필요한 구체성이 부족합니다.`
        : `답변 분량(${charCount}자)이 장황해 면접관이 핵심 요지를 놓칠 우려가 있습니다.`,
  };
}

function estimatedSecondsStr(sec: number): string {
  return `${sec}초`;
}

/**
 * 구술 답변용 정량 수치 규칙 점수 (10점 만점)
 */
export function calculateInterviewMetricRuleScore(metricCount: number): number {
  if (metricCount >= 2) return 10;
  if (metricCount === 1) return 6;
  return 2;
}

export function determineInterviewGrade(score: number): "S" | "A" | "B" | "C" | "D" {
  if (score >= 90) return "S";
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  return "D";
}

function normalizeQuoteText(text: string): string {
  return text
    .trim()
    .replace(/[“”"'`]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeCompact(text: string): string {
  return text
    .trim()
    .replace(/[“”"'`.,!?·\-()\[\]\s]/g, "")
    .toLowerCase();
}

function isQuotePresentInSource(quote: string, source: string): boolean {
  const cleanQuote = normalizeQuoteText(quote);
  const cleanSource = normalizeQuoteText(source);
  if (cleanQuote.length < 4 || !cleanSource) {
    return false;
  }
  if (cleanSource.includes(cleanQuote)) {
    return true;
  }
  const compactQuote = normalizeCompact(quote);
  const compactSource = normalizeCompact(source);
  return compactQuote.length >= 4 && compactSource.includes(compactQuote);
}

function normalizeMismatchCategory(
  raw: unknown
): ConsistencyMismatch["category"] {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s.includes("역할")) return "역할";
  if (s.includes("기여")) return "기여도";
  if (s.includes("수치") || s.includes("기간")) return "수치·기간";
  return "경험 사실";
}

/**
 * 자소서 <-> 답변 일관성 원문 인용 검증 + 오탐 방지 + 인성/무관 질문 '해당 없음' 판정
 */
export function evaluateVerifiedConsistency(options: {
  questionKind: InterviewQuestionKind;
  resumeText: string;
  userAnswer: string;
  aiConsistency: AIInterviewAnchorEvaluation["consistency"];
}): ConsistencyEvaluation {
  const { questionKind, resumeText, userAnswer, aiConsistency } = options;

  const rawMismatches = Array.isArray(aiConsistency?.mismatches)
    ? aiConsistency.mismatches
    : [];

  // 양쪽 원문에 실제 부분 문자열로 존재하는 인용 쌍만 유효 불일치로 인정(환각 인용 오탐 차단)
  const verifiedMismatches: ConsistencyMismatch[] = rawMismatches
    .filter((m) => {
      if (!m || typeof m.resumeQuote !== "string" || typeof m.answerQuote !== "string") {
        return false;
      }
      if (!m.reason || !String(m.reason).trim()) {
        return false;
      }
      return (
        isQuotePresentInSource(m.resumeQuote, resumeText) &&
        isQuotePresentInSource(m.answerQuote, userAnswer)
      );
    })
    .slice(0, 3)
    .map((m) => ({
      category: normalizeMismatchCategory(m.category),
      resumeQuote: m.resumeQuote.trim(),
      answerQuote: m.answerQuote.trim(),
      reason: String(m.reason).trim(),
    }));

  // 인성 질문 등에서 자소서에 비교할 경험 사실 자체가 없는 경우 -> 일관성 "해당 없음" 처리 (85->100 환산 대상)
  const noSharedExperience =
    aiConsistency?.applicable === false ||
    (questionKind === "personality" &&
      aiConsistency?.sharesResumeExperience !== true &&
      verifiedMismatches.length === 0);

  if (noSharedExperience) {
    return {
      applicable: false,
      statusLabel: "해당 없음",
      score: null,
      maxScore: 15,
      summary: "해당 없음 (자소서 경험과 직접 대조 대상 아님 · 85→100점 환산 적용)",
      mismatches: [],
    };
  }

  // 일관성 비교 대상이지만 유효 검증된 불일치가 0건인 경우 -> 오탐 없이 정상 통과 처리
  if (verifiedMismatches.length === 0) {
    return {
      applicable: true,
      statusLabel: "일관성 문제 없음",
      score: 15,
      maxScore: 15,
      summary: "일관성 문제 없음",
      mismatches: [],
    };
  }

  // 검증된 불일치가 1건 이상인 경우 이산 앵커 감점(10 또는 5 또는 0) 적용
  const anchorScore = snapToInterviewAnchor(aiConsistency?.score, [0, 5, 10]);
  const safeScore = verifiedMismatches.length >= 2 ? Math.min(anchorScore, 5) : Math.min(anchorScore, 10);

  return {
    applicable: true,
    statusLabel: "불일치 발견",
    score: safeScore,
    maxScore: 15,
    summary:
      (typeof aiConsistency?.summary === "string" && aiConsistency.summary.trim()) ||
      `자소서 원문과 답변 간 ${verifiedMismatches[0].category} 불일치 ${verifiedMismatches.length}건이 확인되었습니다.`,
    mismatches: verifiedMismatches,
  };
}

/**
 * 고정 채점 루브릭 결합 + 85->100 환산 + 모범답변 수치 날조 차단
 */
export function buildInterviewEvaluationReport(options: {
  questionKind: InterviewQuestionKind;
  resumeText: string;
  userAnswer: string;
  allowedSourceText: string;
  depth: 0 | 1 | 2 | 3;
  aiEval: AIInterviewAnchorEvaluation;
}): AnswerEvaluationReport {
  const {
    questionKind,
    resumeText,
    userAnswer,
    allowedSourceText,
    depth,
    aiEval,
  } = options;

  const detMetrics = countResumeMetrics(userAnswer, 400);
  const conciseness = calculateConcisenessScore(userAnswer, questionKind);

  // 1. STAR 구조 (25점)
  const starS = snapToInterviewAnchor(aiEval.star?.s, [0, 2, 4, 6]);
  const starT = snapToInterviewAnchor(aiEval.star?.t, [0, 2, 4, 6]);
  const starA = snapToInterviewAnchor(aiEval.star?.a, [0, 3, 5, 7]);
  const starR = snapToInterviewAnchor(aiEval.star?.r, [0, 2, 4, 6]);
  const starScore = starS + starT + starA + starR;

  // 2. 수치·역할 구체성 (25점: 규칙 10 + AI 앵커 15)
  const metricRuleScore = calculateInterviewMetricRuleScore(detMetrics.metricCount);
  const roleScore = snapToInterviewAnchor(aiEval.metricsRole?.roleScore, [0, 3, 5, 8]);
  const specScore = snapToInterviewAnchor(aiEval.metricsRole?.specificityScore, [0, 2, 4, 7]);
  const metricsRoleScore = metricRuleScore + roleScore + specScore;

  // 3. 질문 적합성 (20점)
  const directAnswerScore = snapToInterviewAnchor(aiEval.alignment?.directAnswer, [2, 5, 8, 10]);
  const ncsFitScore = snapToInterviewAnchor(aiEval.alignment?.ncsCompetencyFit, [2, 5, 8, 10]);
  const alignmentScore = directAnswerScore + ncsFitScore;

  // 4. 간결성 (15점, 순수 규칙)
  const concisenessScore = conciseness.score;

  // 5. 자소서 일관성 (15점 또는 해당 없음)
  const consistency = evaluateVerifiedConsistency({
    questionKind,
    resumeText,
    userAnswer,
    aiConsistency: aiEval.consistency,
  });

  const rawScore85 = starScore + metricsRoleScore + alignmentScore + concisenessScore;

  // 일관성 '해당 없음' 시 15점 무상 부여 금지 -> 나머지 85점 만점을 100점으로 비례 환산
  const totalScore = consistency.applicable && consistency.score !== null
    ? Math.min(100, Math.max(0, Math.round(rawScore85 + consistency.score)))
    : Math.min(100, Math.max(0, Math.round((rawScore85 / 85) * 100)));

  const scoreFormulaNote = consistency.applicable
    ? "100점 만점 기준 (일관성 15점 포함)"
    : `85점 만점 기준 ${rawScore85}점 → 100점 환산 적용 (일관성 해당 없음)`;

  const categories: InterviewCategoryScore[] = [
    {
      key: "star",
      name:
        questionKind === "personality"
          ? "논리·행동 구조"
          : questionKind === "self_intro"
            ? "도입·핵심경험 구조"
            : "STAR 구조",
      score: starScore,
      maxScore: 25,
      label: starScore >= 20 ? "우수" : starScore >= 14 ? "보통" : "개선 필요",
      applicable: true,
      feedback:
        aiEval.star?.feedback?.trim() ||
        "상황·과제·행동·결과의 구조적 논리 흐름을 점검했습니다.",
    },
    {
      key: "metrics_role",
      name: "수치·역할 구체성",
      score: metricsRoleScore,
      maxScore: 25,
      label: metricsRoleScore >= 20 ? "우수" : metricsRoleScore >= 14 ? "보통" : "개선 필요",
      applicable: true,
      feedback:
        aiEval.metricsRole?.feedback?.trim() ||
        `정량 수치(${detMetrics.metricCount}건) 및 본인 고유 기여도를 평가했습니다.`,
    },
    {
      key: "alignment",
      name: "질문·NCS 적합성",
      score: alignmentScore,
      maxScore: 20,
      label: alignmentScore >= 16 ? "우수" : alignmentScore >= 11 ? "보통" : "개선 필요",
      applicable: true,
      feedback:
        aiEval.alignment?.feedback?.trim() ||
        "질문 의도 직답 여부와 NCS 핵심 역량 부합도를 평가했습니다.",
    },
    {
      key: "conciseness",
      name: "답변 간결성",
      score: concisenessScore,
      maxScore: 15,
      label: conciseness.label,
      applicable: true,
      feedback: conciseness.feedback,
    },
    {
      key: "consistency",
      name: "자소서 일관성",
      score: consistency.score,
      maxScore: 15,
      label: consistency.statusLabel,
      applicable: consistency.applicable,
      feedback: consistency.summary,
    },
  ];

  const rawLines = Array.isArray(aiEval.feedback3Lines)
    ? aiEval.feedback3Lines
        .map((line) =>
          sanitizeUnverifiedNumbers(String(line || "").trim(), allowedSourceText)
        )
        .filter(Boolean)
    : [];
  const feedback3Lines: [string, string, string] = [
    rawLines[0] || "핵심 결론을 첫 문장에 두고 근거 경험을 연결해 답변 구조를 안정화하세요.",
    rawLines[1] || "본인이 직접 결정하고 실행한 고유 역할을 주어로 명확히 구분해 말씀하세요.",
    rawLines[2] || `구체적 전후 변화나 객관적 근거(${UNVERIFIED_METRIC_PLACEHOLDER})를 덧붙이면 설득력이 높아집니다.`,
  ];

  const digPoint = sanitizeUnverifiedNumbers(
    (typeof aiEval.digPoint === "string" && aiEval.digPoint.trim()) ||
      "답변에서 언급한 행동의 구체적 판단 기준과 대안 비교 근거",
    allowedSourceText
  );

  const sanitizedModelAnswer = sanitizeUnverifiedNumbers(
    (typeof aiEval.modelAnswer === "string" && aiEval.modelAnswer.trim()) ||
      "질문의 핵심에 맞춰 상황, 본인의 주도적 판단과 실행, 그리고 검증 가능한 결과를 두괄식으로 정리해 답변하시기 바랍니다.",
    allowedSourceText
  );

  const nextDepthNum = depth + 1;
  const nextFollowUp: FollowUpPrompt | null =
    nextDepthNum <= 3 &&
    aiEval.nextFollowUp &&
    typeof aiEval.nextFollowUp.question === "string" &&
    aiEval.nextFollowUp.question.trim()
      ? {
          depth: nextDepthNum as 1 | 2 | 3,
          ncsCompetency: normalizeNcsCompetency(aiEval.nextFollowUp.ncsCompetency),
          focus:
            typeof aiEval.nextFollowUp.focus === "string" &&
            aiEval.nextFollowUp.focus.trim()
              ? aiEval.nextFollowUp.focus.trim()
              : digPoint,
          question: aiEval.nextFollowUp.question.trim(),
        }
      : null;

  return {
    totalScore,
    rawScore85,
    consistencyApplied: consistency.applicable,
    scoreFormulaNote,
    grade: determineInterviewGrade(totalScore),
    charCount: conciseness.charCount,
    estimatedSpeechSeconds: conciseness.estimatedSpeechSeconds,
    metricCount: detMetrics.metricCount,
    categories,
    feedback3Lines,
    digPoint,
    consistency,
    modelAnswer: sanitizedModelAnswer,
    modelAnswerLocked: false,
    nextFollowUp,
    nextFollowUpLocked: false,
  };
}

/**
 * 무료 체험 응답용 서버 레벨 필터링:
 * - 모범 답변(modelAnswer)은 네트워크 응답에서 완전 제거(null)
 * - 1단계 꼬리질문은 질문 텍스트 미리보기만 허용(답변 채점 및 2~3단계 잠금)
 */
export function buildFreeEvaluationResponse(
  report: AnswerEvaluationReport
): AnswerEvaluationReport {
  return {
    ...report,
    modelAnswer: null,
    modelAnswerLocked: true,
    nextFollowUp: report.nextFollowUp
      ? { ...report.nextFollowUp, depth: 1 }
      : null,
    nextFollowUpLocked: Boolean(report.nextFollowUp),
  };
}
