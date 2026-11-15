import { GoogleGenerativeAI, SchemaType, type Schema } from "@google/generative-ai";
import { GEMINI_CONFIG, generateContentWithFallback } from "@/lib/gemini";
import {
  INTERVIEW_FREE_QUESTION_COUNT,
  INTERVIEW_JOB_QUESTION_COUNT,
  INTERVIEW_PERSONALITY_QUESTION_COUNT,
} from "@/lib/policy";
import {
  NCS_COMPETENCIES,
  normalizeNcsCompetency,
  resolveInterviewRoleDescription,
  snapToInterviewAnchor,
  type AIInterviewAnchorEvaluation,
  type SimulatorQuestion,
} from "@/lib/interviewRubric";

function stripMarkdownFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

const QUESTION_SET_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    questions: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          number: { type: SchemaType.INTEGER },
          kind: {
            type: SchemaType.STRING,
            format: "enum",
            enum: ["job", "personality"],
          },
          ncsCompetency: {
            type: SchemaType.STRING,
            format: "enum",
            enum: [...NCS_COMPETENCIES],
          },
          intentSummary: { type: SchemaType.STRING },
          question: { type: SchemaType.STRING },
        },
        required: ["number", "kind", "ncsCompetency", "intentSummary", "question"],
      },
    },
  },
  required: ["questions"],
};

const EVALUATION_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    star: {
      type: SchemaType.OBJECT,
      properties: {
        s: { type: SchemaType.INTEGER, description: "0, 2, 4, 6 중 하나" },
        t: { type: SchemaType.INTEGER, description: "0, 2, 4, 6 중 하나" },
        a: { type: SchemaType.INTEGER, description: "0, 3, 5, 7 중 하나" },
        r: { type: SchemaType.INTEGER, description: "0, 2, 4, 6 중 하나" },
        feedback: { type: SchemaType.STRING },
      },
      required: ["s", "t", "a", "r", "feedback"],
    },
    metricsRole: {
      type: SchemaType.OBJECT,
      properties: {
        roleScore: { type: SchemaType.INTEGER, description: "0, 3, 5, 8 중 하나" },
        specificityScore: { type: SchemaType.INTEGER, description: "0, 2, 4, 7 중 하나" },
        feedback: { type: SchemaType.STRING },
      },
      required: ["roleScore", "specificityScore", "feedback"],
    },
    alignment: {
      type: SchemaType.OBJECT,
      properties: {
        directAnswer: { type: SchemaType.INTEGER, description: "2, 5, 8, 10 중 하나" },
        ncsCompetencyFit: { type: SchemaType.INTEGER, description: "2, 5, 8, 10 중 하나" },
        feedback: { type: SchemaType.STRING },
      },
      required: ["directAnswer", "ncsCompetencyFit", "feedback"],
    },
    consistency: {
      type: SchemaType.OBJECT,
      properties: {
        applicable: { type: SchemaType.BOOLEAN },
        sharesResumeExperience: { type: SchemaType.BOOLEAN },
        score: { type: SchemaType.INTEGER, description: "0, 5, 10, 15 중 하나" },
        hasInconsistency: { type: SchemaType.BOOLEAN },
        summary: { type: SchemaType.STRING },
        mismatches: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              category: {
                type: SchemaType.STRING,
                format: "enum",
                enum: ["역할", "기여도", "수치·기간", "경험 사실"],
              },
              resumeQuote: { type: SchemaType.STRING },
              answerQuote: { type: SchemaType.STRING },
              reason: { type: SchemaType.STRING },
            },
            required: ["category", "resumeQuote", "answerQuote", "reason"],
          },
        },
      },
      required: [
        "applicable",
        "sharesResumeExperience",
        "score",
        "hasInconsistency",
        "summary",
        "mismatches",
      ],
    },
      feedback3Lines: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: "각 55자 이내의 구체적 면접관 피드백 정확히 3줄",
    },
    digPoint: {
      type: SchemaType.STRING,
      description: "직전 답변에서 가장 취약하거나 검증이 필요한 파고들 지점 1문장 (55자 이내)",
    },
    modelAnswer: {
      type: SchemaType.STRING,
      description: "200~320자 두괄식 STAR 모범 답변 예시 (미검증 수치 생성 금지 -> [본인 수치 입력])",
    },
    nextFollowUp: {
      type: SchemaType.OBJECT,
      nullable: true,
      properties: {
        ncsCompetency: {
          type: SchemaType.STRING,
          format: "enum",
          enum: [...NCS_COMPETENCIES],
        },
        focus: { type: SchemaType.STRING },
        question: { type: SchemaType.STRING },
      },
      required: ["ncsCompetency", "focus", "question"],
    },
  },
  required: [
    "star",
    "metricsRole",
    "alignment",
    "consistency",
    "feedback3Lines",
    "digPoint",
    "modelAnswer",
  ],
};

/**
 * 자소서 기반 공공기관 면접 예상 질문 세트 생성
 * - 무료: 3문항 (직무 2 + 공공기관 인성 1)
 * - 유료: 15문항 (직무 10 + 공공기관 인성·조직적합성 5)
 */
export async function generateInterviewQuestionSet(options: {
  genAI: GoogleGenerativeAI;
  jobCategory: string;
  resumeText: string;
  isFree: boolean;
}): Promise<{
  questions: SimulatorQuestion[];
  usedModel: string;
  thinkingLevel: string;
  attempts: number;
  durationMs: number;
  usage: {
    promptTokens: number;
    completionTokens: number;
    thinkingTokens: number;
    totalTokens: number;
  };
}> {
  const { genAI, jobCategory, resumeText, isFree } = options;
  const roleDescription = resolveInterviewRoleDescription(jobCategory);

  const countInstruction = isFree
    ? `총 ${INTERVIEW_FREE_QUESTION_COUNT}개의 면접 질문을 생성하세요:
- 1~2번 (kind: "job"): 자소서 경험과 직무 역량을 파고드는 직무 심층 질문 2문항
- 3번 (kind: "personality"): 공직가치·청렴·민원대응·협업을 묻는 공공기관 인성·조직적합성 질문 1문항`
    : `총 ${INTERVIEW_JOB_QUESTION_COUNT + INTERVIEW_PERSONALITY_QUESTION_COUNT}개의 면접 질문을 정확히 생성하세요:
- 1~10번 (kind: "job", 10문항): 지원자의 자기소개서 경험·역량·수치·판단 근거를 파고드는 직무/경험 심층 질문
- 11~15번 (kind: "personality", 5문항): 공직가치, 청렴·규정 준수, 악성 민원 및 갈등 대응, 부서 협업, 공공기관 조직적합성을 묻는 공공기관 인성·상황판단 질문`;

  const prompt = `당신은 ${roleDescription}입니다.
지원자의 자기소개서를 바탕으로 실제 공공기관 블라인드 면접장에서 나올 법한 날카로운 예상 질문을 생성해 JSON으로만 출력하세요.

[문항 구성 규칙]
${countInstruction}

[NCS 직업기초능력 10개 영역 매핑 필수]
모든 문항의 ncsCompetency에는 반드시 아래 10개 중 가장 적합한 1개만 정확히 지정하세요:
${NCS_COMPETENCIES.join(", ")}

[작성 규칙]
1. 직무 질문(job)은 지원자 자소서에 나온 실제 경험·역할·행동의 진위와 한계를 검증하도록 날카롭게 작성하세요.
2. 공공기관 인성·조직적합성 질문(personality)은 청렴, 공익 우선, 규정 준수 대 고객 편의 갈등, 민원 응대, 조직 내 소통 등 공공기관 면접 핵심 주제로 출제하세요.
3. 자소서 원문에 없는 수치나 이력을 질문에 지어내지 마세요.
4. intentSummary는 면접관이 이 질문으로 검증하려는 핵심 의도(1문장)를 적으세요.
5. question은 실제 면접관 어조의 직접 질문 1~2문장으로 작성하세요.

[지원 직무 분야]
${jobCategory.trim()}

[지원자 자기소개서]
${resumeText.trim()}`;

  const genResult = await generateContentWithFallback(
    genAI,
    prompt,
    GEMINI_CONFIG.PRIMARY_MODEL,
    "low",
    {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: QUESTION_SET_SCHEMA,
      perAttemptTimeoutMs: isFree ? 18_000 : 25_000,
      fallbackAttemptTimeoutMs: isFree ? 12_000 : 18_000,
      totalBudgetMs: isFree ? 32_000 : 45_000,
    }
  );

  const parsed = JSON.parse(stripMarkdownFences(genResult.text)) as {
    questions?: Array<{
      number?: number;
      kind?: string;
      ncsCompetency?: string;
      intentSummary?: string;
      question?: string;
    }>;
  };

  const targetCount = isFree
    ? INTERVIEW_FREE_QUESTION_COUNT
    : INTERVIEW_JOB_QUESTION_COUNT + INTERVIEW_PERSONALITY_QUESTION_COUNT;
  const jobThreshold = isFree ? 2 : INTERVIEW_JOB_QUESTION_COUNT;

  const rawList = Array.isArray(parsed.questions) ? parsed.questions : [];
  if (rawList.length === 0) {
    throw new Error("Generated interview questions payload was empty.");
  }

  const normalizedQuestions: SimulatorQuestion[] = rawList
    .slice(0, targetCount)
    .map((item, idx) => {
      const num = idx + 1;
      const expectedKind = idx < jobThreshold ? "job" : "personality";
      return {
        id: `q${num}`,
        number: num,
        kind:
          item.kind === "personality" || item.kind === "job"
            ? idx >= jobThreshold
              ? "personality"
              : item.kind
            : expectedKind,
        ncsCompetency: normalizeNcsCompetency(item.ncsCompetency),
        intentSummary:
          typeof item.intentSummary === "string" && item.intentSummary.trim()
            ? item.intentSummary.trim()
            : expectedKind === "personality"
              ? "공직가치 및 조직적합성 검증"
              : "직무 관련 경험의 실제 기여도 및 문제해결 논리 검증",
        question:
          typeof item.question === "string" && item.question.trim()
            ? item.question.trim()
            : "해당 경험에서 본인이 직접 판단하고 실행한 핵심 조치와 결과를 구체적으로 말씀해 주세요.",
      };
    });

  return {
    questions: normalizedQuestions,
    usedModel: genResult.usedModel,
    thinkingLevel: genResult.thinkingLevel,
    attempts: genResult.attempts,
    durationMs: genResult.durationMs,
    usage: genResult.usage,
  };
}

/**
 * 답변 채점 + 자소서 일관성 검증 + 동적 꼬리질문 생성 (3~5초 목표)
 * - gemini-3.8-flash + thinkingLevel: "low" + temperature: 0 + responseSchema
 */
export async function evaluateInterviewAnswerWithAI(options: {
  genAI: GoogleGenerativeAI;
  jobCategory: string;
  question: SimulatorQuestion;
  currentPromptQuestion: string;
  depth: 0 | 1 | 2 | 3;
  resumeText: string;
  userAnswer: string;
  priorHistory?: Array<{ depth: number; question: string; userAnswer: string }>;
  generateNextFollowUp: boolean;
}): Promise<{
  evaluation: AIInterviewAnchorEvaluation;
  usedModel: string;
  attempts: number;
  durationMs: number;
}> {
  const {
    genAI,
    jobCategory,
    question,
    currentPromptQuestion,
    depth,
    resumeText,
    userAnswer,
    priorHistory = [],
    generateNextFollowUp,
  } = options;

  const roleDescription = resolveInterviewRoleDescription(jobCategory);
  const nextDepth = depth + 1;

  const stageInstruction =
    !generateNextFollowUp || nextDepth > 3
      ? `- 이번 답변은 3단계 최종 심화 답변이거나 꼬리질문 미생성 단계이므로 nextFollowUp은 반드시 null로 반환하세요.`
      : `- nextFollowUp(다음 ${nextDepth}단계 꼬리질문)을 반드시 생성하세요:
  · 1단계: 지원자가 답변에서 뭉뚱그린 상황·본인 고유 역할·근거 사실을 날카롭게 확인하는 질문
  · 2단계: 왜 그 방식을 택했는지 대안 비교·판단 기준·예외 리스크를 캐묻는 질문
  · 3단계: 답변의 허점·일관성/수치 신빙성 또는 공공기관 규정·윤리·대민 갈등 압박 질문
  · 반드시 위 digPoint에서 짚은 약점을 정면으로 파고드는 1~2문장으로 작성하세요.`;

  const historyBlock =
    priorHistory.length > 0
      ? priorHistory
          .map(
            (h) =>
              `[${h.depth === 0 ? "기본 질문" : `${h.depth}단계 꼬리질문`}] ${h.question}\n-> 지원자 답변: ${h.userAnswer}`
          )
          .join("\n\n")
      : "없음 (최초 질문 응답)";

  const prompt = `당신은 ${roleDescription}입니다.
아래 면접 질문과 지원자의 구술 답변을 공정한 이산 앵커 루브릭에 따라 채점하고, 자소서 원문과의 일관성을 대조한 뒤 JSON으로만 응답하세요.
반드시 동일한 입력에는 항상 동일한 앵커 등급이 나오도록 보수적이고 일관되게 채점하세요.

[1. 고정 채점 앵커 기준표 (temperature: 0, 반드시 지정 정수 중 선택)]
※ 일관성(재현성) 원칙: 추상적 인상("우수해 보인다") 대신 **답변 내 아래 요소의 명시적 포함 여부(O/X)**만 기준으로 엄격히 판정하세요.

1) STAR / 논리·행동 구조 (25점):
- s (상황/원칙 맥락): 0(상황 전무), 2(단순 배경만 언급, 문제/원인 없음), 4(구체적 문제 상황·원인이 제시됨), 6(문제 상황 + 수치적·제도적 제약 조건까지 함께 명시됨)
- t (과제/기준): 0(과제 전무), 2(추상적 다짐·노력), 4(해결 목표가 1개 명시됨), 6(해결 우선순위 또는 판단 기준 2가지 이상이 명시됨)
- a (행동/대응): 0(행동 전무), 3("열심히/소통했다" 식 추상 서술만 있음), 5(구체 실행 조치 1가지 이상 제시했으나 타 대안 비교나 예외 상황 대응은 없음), 7(실행 조치와 함께 대안 비교·예외 리스크 대응 절차까지 명시됨)
- r (결과/직무적용): 0(결과 전무), 2("배웠다/좋았다" 식 감상만 있음), 4(결과·개선 효과는 있으나 매뉴얼/체계 등 조직 표준화 적용은 없음), 6(결과와 함께 매뉴얼·체크리스트·시스템 등 조직 표준화/재발방지 반영까지 명시됨)

2) 수치·역할 구체성 (25점 중 AI 15점, 수치 10점은 서버 규칙 산출):
- roleScore (본인 고유 역할): 0("우리가/팀이" 위주로 본인 역할 불명), 3(단순 보조·지시 수행), 5(담당 파트를 직접 주도·실행했으나 상급자 승인/지시 범위 내 수행), 8(문제 발굴·방식 결정·유관자 조율까지 본인 책임하에 단독 주도함)
- specificityScore (근거 구체성): 0(사례·근거 전무), 2(단순 사실 1개 나열), 4(실행 절차·전후 수치가 제시되나 시행 후 오류 수정·보완 검증 사례는 없음), 7(절차·전후 수치와 함께 시행착오 보완·사후 검증 근거까지 명시됨)

3) 질문·NCS 적합성 (20점):
- directAnswer: 2(질문 회피/동문서답), 5(관련은 있으나 결론이 흐림), 8(질문 핵심에 직접 답하나 예외 조건 대응은 미포함), 10(두괄식으로 핵심 직답 + 예외·후속 조건까지 선제 답변함)
- ncsCompetencyFit: 2(직무·NCS 역량 미흡), 5(일반 수준), 8(요구 NCS 역량·실무 판단이 양호함), 10(요구 NCS 역량과 함께 공직 규정·공정성·대민 형평성 판단까지 명시됨)

※ 피상적이더라도 질문 주제에 맞춰 답하려 시도한 답변은 최저 0점 남발 대신 2/3/5 단계로 평가하고, 완전히 질문 회피·무관한 답변에만 최저(0/2)를 부여하세요.
(star.feedback, metricsRole.feedback, alignment.feedback는 각 35자 이내 1줄로 간결히 작성)

[2. 자소서 ↔ 답변 일관성 정밀 대조 규칙 (매우 중요)]
비교 4대 축: ① 역할(Role: 보조 vs 총괄) ② 기여도(Contribution: 공동 vs 단독 과장) ③ 수치·기간(Metrics/Timeline) ④ 경험 사실(Facts/Tools/Outcome)
- **오탐(False Positive) 엄격 금지**:
  · 자소서에 분량상 생략된 세부 과정·숫자·에피소드를 면접 답변에서 새롭게 구체화(Elaboration)하거나 같은 사실을 동의어로 바꿔 말한 것(Paraphrasing)은 **정상 보충**입니다. 절대 불일치로 판정하지 마세요.
  · 정상인 경우 반드시 \`applicable: true, hasInconsistency: false, score: 15, summary: "일관성 문제 없음", mismatches: []\`를 반환하세요.
- **인성·자소서 무관 경험 ('해당 없음') 판정 규칙**:
  · 질문 유형(\`question.kind\`)이 \`"personality"\`(공직가치·청렴·민원 가상 시나리오 등)이거나, 지원자의 답변이 자소서에 서술된 경험과 전혀 다른 일반 가치관·신규 사례를 다뤄 자소서와 대조할 사실 자체가 없다면, **일관성 15점을 부여하지 말고** 반드시 \`applicable: false, sharesResumeExperience: false, hasInconsistency: false, summary: "해당 없음"\`으로 반환하세요.
  · 단, 인성 질문이라도 답변 속에서 지원자가 자소서에 쓴 특정 경험·역할·수치를 직접 언급하고 그것이 자소서와 충돌하는 경우에는 \`applicable: true, sharesResumeExperience: true\`로 설정해 불일치를 잡아내세요.
- **불일치 탐지(applicable: true & 실제 상충 시) 원문 인용 규칙**:
  · \`resumeQuote\`에는 반드시 아래 [지원자 자기소개서]에 **실제 존재하는 문구 그대로**를 발췌하고, \`answerQuote\`에는 [이번 지원자 답변]에 **실제 존재하는 문구 그대로**를 발췌하세요. 지어낸 요약 인용은 절대 금지합니다.
  · \`score\`: 중대 모순(역할/수치/결과 정반대) 다수=0, 명확한 불일치 1건=5, 경미한 범위 과장/확인 필요=10.

[3. 피드백 · 파고들 지점 · 모범 답변 · 꼬리질문 규칙]
- feedback3Lines: 강점/논리·구체성 보완/직무·공공기관 관점 조언을 정확히 3개 문자열(각 55자 이내)로 작성.
- digPoint: 직전 답변에서 면접관이 파고들어야 할 가장 치명적인 빈틈 1문장(55자 이내).
- modelAnswer: 지원자의 실제 경험·수치 맥락만 살려 200~320자 분량의 간결한 두괄식 STAR 구술 모범 답변으로 작성하세요. **자소서와 답변 원문에 없는 %, 원, 만, 억, 건, 명, 배, 시간, Zero 등 정량 수치를 절대 지어내지 말고, 수치가 필요한 자리는 반드시 "[본인 수치 입력]"으로만 적으세요.**
${stageInstruction}

[평가 대상 정보]
- 지원 직무 분야: ${jobCategory}
- 질문 유형: ${question.kind === "personality" ? "공공기관 인성·조직적합성(personality)" : "직무·경험 심층(job)"}
- 매핑된 NCS 영역: ${question.ncsCompetency}
- 현재 질문 (단계 ${depth}/3): ${currentPromptQuestion}

[동일 문항 이전 대화 흐름]
${historyBlock}

[지원자 자기소개서 원문 (대조 기준)]
${resumeText.trim()}

[이번 지원자 답변 (${userAnswer.trim().length}자)]
${userAnswer.trim()}`;

  const genResult = await generateContentWithFallback(
    genAI,
    prompt,
    GEMINI_CONFIG.PRIMARY_MODEL,
    "low",
    {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: EVALUATION_SCHEMA,
      perAttemptTimeoutMs: 22_000,
      fallbackAttemptTimeoutMs: 18_000,
      totalBudgetMs: 42_000,
    }
  );

  const raw = JSON.parse(stripMarkdownFences(genResult.text)) as Partial<AIInterviewAnchorEvaluation>;

  const evaluation: AIInterviewAnchorEvaluation = {
    star: {
      s: snapToInterviewAnchor(raw.star?.s, [0, 2, 4, 6]),
      t: snapToInterviewAnchor(raw.star?.t, [0, 2, 4, 6]),
      a: snapToInterviewAnchor(raw.star?.a, [0, 3, 5, 7]),
      r: snapToInterviewAnchor(raw.star?.r, [0, 2, 4, 6]),
      feedback: raw.star?.feedback || "",
    },
    metricsRole: {
      roleScore: snapToInterviewAnchor(raw.metricsRole?.roleScore, [0, 3, 5, 8]),
      specificityScore: snapToInterviewAnchor(raw.metricsRole?.specificityScore, [0, 2, 4, 7]),
      feedback: raw.metricsRole?.feedback || "",
    },
    alignment: {
      directAnswer: snapToInterviewAnchor(raw.alignment?.directAnswer, [2, 5, 8, 10]),
      ncsCompetencyFit: snapToInterviewAnchor(raw.alignment?.ncsCompetencyFit, [2, 5, 8, 10]),
      feedback: raw.alignment?.feedback || "",
    },
    consistency: {
      applicable: raw.consistency?.applicable !== false,
      sharesResumeExperience: raw.consistency?.sharesResumeExperience === true,
      score: snapToInterviewAnchor(raw.consistency?.score, [0, 5, 10, 15]),
      hasInconsistency: raw.consistency?.hasInconsistency === true,
      summary: raw.consistency?.summary || "일관성 문제 없음",
      mismatches: Array.isArray(raw.consistency?.mismatches)
        ? raw.consistency.mismatches
        : [],
    },
    feedback3Lines: Array.isArray(raw.feedback3Lines) ? raw.feedback3Lines : [],
    digPoint: raw.digPoint || "",
    modelAnswer: raw.modelAnswer || "",
    nextFollowUp: generateNextFollowUp ? raw.nextFollowUp ?? null : null,
  };

  return {
    evaluation,
    usedModel: genResult.usedModel,
    attempts: genResult.attempts,
    durationMs: genResult.durationMs,
  };
}
