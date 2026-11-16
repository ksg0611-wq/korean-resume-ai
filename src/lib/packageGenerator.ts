import { GoogleGenerativeAI, SchemaType, type Schema } from "@google/generative-ai";
import { GEMINI_CONFIG, generateContentWithFallback } from "@/lib/gemini";
import {
  countResumeMetrics,
  sanitizeInterviewQuestionText,
  sanitizeUnverifiedNumbers,
  sanitizeUnverifiedResumeText,
} from "@/lib/textMetrics";
import { detectBlindViolations } from "@/lib/blindCheck";
import type { AIAnchorEvaluation } from "@/lib/diagnoseRubric";
import { STANDARD_RESUME_QUESTIONS } from "@/lib/policy";
import type {
  InterviewQuestionItem,
  LockedResumeQuestionItem,
  ResumeQuestionItem,
} from "@/lib/results";

const DRAFT_RESPONSE_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    items: {
      type: SchemaType.ARRAY,
      description: "반드시 순서대로 1번~4번까지 4개의 자소서 문항 배열",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          id: { type: SchemaType.STRING },
          order: { type: SchemaType.INTEGER },
          title: { type: SchemaType.STRING },
          body: { type: SchemaType.STRING },
        },
        required: ["id", "order", "title", "body"],
      },
    },
  },
  required: ["items"],
};

const INTERVIEW_10_RESPONSE_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    questions: {
      type: SchemaType.ARRAY,
      description: "반드시 1번~10번까지 총 10개의 맞춤형 면접 예상 질문 배열",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          number: { type: SchemaType.INTEGER },
          category: { type: SchemaType.STRING },
          question: { type: SchemaType.STRING },
          intent: { type: SchemaType.STRING },
          answerTip: { type: SchemaType.STRING },
        },
        required: ["number", "category", "question", "intent", "answerTip"],
      },
    },
  },
  required: ["questions"],
};

const DIAGNOSIS_RESPONSE_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    star: {
      type: SchemaType.OBJECT,
      properties: {
        s: {
          type: SchemaType.INTEGER,
          description: "0, 2, 4, 6 중 하나의 앵커 점수만 선택",
        },
        t: {
          type: SchemaType.INTEGER,
          description: "0, 2, 4, 6 중 하나의 앵커 점수만 선택",
        },
        a: {
          type: SchemaType.INTEGER,
          description: "0, 3, 5, 7 중 하나의 앵커 점수만 선택",
        },
        r: {
          type: SchemaType.INTEGER,
          description: "0, 2, 4, 6 중 하나의 앵커 점수만 선택",
        },
        feedback: { type: SchemaType.STRING },
      },
      required: ["s", "t", "a", "r", "feedback"],
    },
    metricsRole: {
      type: SchemaType.OBJECT,
      properties: {
        roleScore: {
          type: SchemaType.INTEGER,
          description: "0, 3, 5, 8 중 하나의 앵커 점수만 선택",
        },
        specificityScore: {
          type: SchemaType.INTEGER,
          description: "0, 2, 4, 7 중 하나의 앵커 점수만 선택",
        },
        feedback: { type: SchemaType.STRING },
      },
      required: ["roleScore", "specificityScore", "feedback"],
    },
    alignment: {
      type: SchemaType.OBJECT,
      properties: {
        jobFit: {
          type: SchemaType.INTEGER,
          description: "3, 5, 7, 9, 10 중 하나의 앵커 점수만 선택",
        },
        questionFocus: {
          type: SchemaType.INTEGER,
          description: "3, 5, 7, 9, 10 중 하나의 앵커 점수만 선택",
        },
        feedback: { type: SchemaType.STRING },
      },
      required: ["jobFit", "questionFocus", "feedback"],
    },
    weaknesses: {
      type: SchemaType.ARRAY,
      description: "발견된 구체적 약점 4~5건 (high/medium 포함)",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          categoryKey: { type: SchemaType.STRING },
          title: { type: SchemaType.STRING },
          severity: {
            type: SchemaType.STRING,
            format: "enum",
            enum: ["high", "medium"],
          },
          description: { type: SchemaType.STRING },
        },
        required: ["categoryKey", "title", "severity", "description"],
      },
    },
    sampleFix: {
      type: SchemaType.OBJECT,
      properties: {
        title: { type: SchemaType.STRING },
        beforeExcerpt: { type: SchemaType.STRING },
        afterExample: { type: SchemaType.STRING },
        tip: { type: SchemaType.STRING },
      },
      required: ["title", "beforeExcerpt", "afterExample", "tip"],
    },
  },
  required: ["star", "metricsRole", "alignment", "weaknesses", "sampleFix"],
};

function snapToAnchor(value: unknown, anchors: readonly number[]): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return anchors[1] ?? anchors[0];
  let best = anchors[0];
  let minDiff = Math.abs(num - best);
  for (let i = 1; i < anchors.length; i++) {
    const diff = Math.abs(num - anchors[i]);
    if (diff < minDiff) {
      best = anchors[i];
      minDiff = diff;
    }
  }
  return best;
}

function stripMarkdownFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

import {
  formatJobContextPromptBlock,
  type VerifiedResumeJobContext,
} from "@/lib/jobContext";

export async function evaluateDiagnosisWithAI(options: {
  genAI: GoogleGenerativeAI;
  text: string;
  jobTitle?: string;
  questionPrompt?: string;
  targetChars?: number;
  jobContext?: VerifiedResumeJobContext | null;
}): Promise<{ evaluation: AIAnchorEvaluation; usedModel: string; durationMs: number }> {
  const { genAI, text, jobTitle, questionPrompt, targetChars = 700, jobContext } = options;
  const detMetrics = countResumeMetrics(text, targetChars);
  const detBlind = detectBlindViolations(text);
  const effectiveJobLabel =
    jobTitle?.trim() ||
    (jobContext ? `[${jobContext.instName}] ${jobContext.title}` : "") ||
    "미지정 (일반 사무/기술 직무 기준 평가)";
  const jobContextBlock = formatJobContextPromptBlock(jobContext, "diagnose");

  const prompt = `당신은 10년 이상 경력의 국내 공기업(NCS)·대기업 서류 전형 심사위원입니다.
아래 자기소개서 원문을 공정하고 일관된 이산 앵커 기준표(Discrete Rubric Anchors)에 따라 채점하고 JSON으로만 응답하세요.
반드시 동일한 자소서에는 항상 동일한 앵커 등급이 나오도록 보수적·객관적으로 채점합니다.

[고정 채점 앵커 기준표 — 반드시 아래 관찰 가능한 객관적 기준에만 근거하여 동일한 입력에 항상 동일한 앵커를 선택하세요]
1. STAR 구조 (각 항목은 반드시 지정된 정수 중 하나만 선택):
- s (상황 Situation): 0(배경·시점 전무), 2(장소·모임명 등 단어만 언급), 4(시기·배경은 있으나 해결해야 할 문제 상황 불명확), 6(언제·어디서·어떤 문제/병목 상황인지 문장으로 선명함)
- t (과제 Task): 0(목표·과제 언급 없음), 2(단순 참여/팀 목표만 언급), 4(해결 과제는 보이나 제약 조건·달성 기준 약함), 6(본인이 해결해야 할 핵심 과제와 요구 수준이 명확함)
- a (행동 Action): 0(행동 없음), 3("최선을 다했다/열심히 했다" 식 추상 서술만 있음), 5(구체 행동 1~2가지는 있으나 왜 그 방법을 택했는지 판단 근거 부족), 7(문제 원인 진단부터 대안 선택 근거와 단계별 실행이 구체적)
- r (결과 Result): 0(결과 없음), 2("많이 배웠다/보람찼다" 식 감상만 있음), 4(개선 사실은 있으나 객관적 근거 또는 직무 적용점 중 1개 누락), 6(검증 가능한 성과와 입사 후 직무 적용점이 모두 명시됨)

2. 수치·역할 구체성 (반드시 지정된 정수 중 하나만 선택):
- roleScore (본인 고유 역할): 0("함께/우리가" 위주여서 본인 역할 불분명), 3(단순 보조·참여 수준), 5(본인 담당 파트 1개는 보이나 주도적 설계는 약함), 8(본인이 직접 기획·조율·의사결정한 고유 기여 범위가 명확)
- specificityScore (근거 구체성): 0(구체 사례·수치 전무), 2(기간·인원 등 기초 사실 1건 수준), 4(실행 과정과 변화가 있으나 전후 비교 근거 부족), 7(Before→After 변화 또는 복수의 정량·정성 근거로 재현 가능한 방식 입증)

3. 문항·직무 적합성 alignment (각 항목 반드시 지정된 정수 중 하나만 선택):
- jobFit (직무 역량 부합도 — 3, 5, 7, 9, 10 중 선택):
  3: 직무와 무관한 일상 감상 수준
  5: 일반 경험이나 지원 직무 키워드·연결이 단편적
  7: 지원 직무와 유관한 경험(실습/프로젝트)과 기본 역량이 제시됨
  9: 지원 직무의 핵심 업무 프로세스·실무 역량과 직접 부합함
  10: 지원 기관/직무 특성·요구 역량과 정밀하게 일치하고 입사 후 활용이 선명함
- questionFocus (문항 질문 응답 충실도 — 3, 5, 7, 9, 10 중 선택):
  3: 문항이 묻는 질문에 대한 핵심 답변이 누락됨
  5: 질문과 일부 관련되나 나열식 서술로 초점이 분산됨
  7: 문항 의도에 맞는 단일 핵심 경험을 중심으로 구조화됨
  9: 문항이 요구하는 요소(문제원인-해결과정-성과 또는 지원동기)를 충실히 충족함
  10: 문항의 모든 세부 요구 조건에 군더더기 없이 정면으로 답변함

[약점(weaknesses) 및 수정 예시(sampleFix) 규칙]
- weaknesses는 가장 치명적인 순으로 4~5건을 작성하세요 (severity는 "high" 또는 "medium"). 공고 자격요건·우대사항 대비 부족한 역량은 **오직 weaknesses 항목에서만** 지적하세요.
- 블라인드 위반 여부·단어 위치는 서버 규칙 엔진이 별도로 잠금 처리하므로 weaknesses와 sampleFix에 출신 학교명·가족·출신지 등 블라인드 위반 단어나 위치를 절대 인용하거나 언급하지 마세요. 오직 STAR 구조, 수치·역할 구체성, 직무/문항 적합성, 문장 설득력 약점만 작성하세요.
- **[경험·행동·자격 날조 절대 금지]** sampleFix는 원문에서 블라인드 정보와 무관한 일반 경험 문장 1~2개를 beforeExcerpt에 그대로 발췌하고, afterExample에서는 **지원자가 원문에 직접 적은 사실(한 일, 맡은 역할, 사용한 도구, 실제 결과)만 STAR 구조로 문장만 다듬으세요.**
- **원문에 없는 새로운 행동("단순 정리 보조"를 "표준 분류 기준에 맞춰 재분류/체계 정립"으로 부풀리기 등), 원문에 없는 자격증(~기사, ~자격증, 컴활, 한국사), 시스템·툴(RMS, ERP, SAP, SQL, 파이썬), 과장 직책(총괄, 팀장, 리드)은 절대 지어내지 마세요.** 추가 경험·자격·수치가 들어가야 하는 빈자리는 반드시 \`[해당 경험이 있다면 입력: 예) 기록물 분류 기준 적용 경험]\` 및 \`[본인 수치 입력]\` 자리표시로만 표기하세요.

[참고 규칙 기반 사전 측정]
- 공백 포함 글자수: ${detMetrics.charCount}자 (목표 ${targetChars}자)
- 본문 내 정량 수치 토큰 수: ${detMetrics.metricCount}개
- 블라인드 위반 의심 건수: ${detBlind.totalViolations}건 (점수는 서버가 별도 계산함)

[지원 정보]
- 지원 기관/직무: ${effectiveJobLabel}
- 자기소개서 문항: ${questionPrompt?.trim() || "미지정 (직무역량/지원동기/문제해결 기준 평가)"}
${jobContextBlock}
[자기소개서 원문]
${text.trim()}`;

  const genResult = await generateContentWithFallback(
    genAI,
    prompt,
    GEMINI_CONFIG.SCORING_MODEL,
    "low",
    {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: DIAGNOSIS_RESPONSE_SCHEMA,
      perAttemptTimeoutMs: 20_000,
      totalBudgetMs: 38_000,
    }
  );

  type RawDiagnosisPayload = Omit<Partial<AIAnchorEvaluation>, "alignment"> & {
    alignment?: {
      jobFit?: unknown;
      questionFocus?: unknown;
      score?: unknown;
      feedback?: string;
    };
  };
  const raw = JSON.parse(stripMarkdownFences(genResult.text)) as RawDiagnosisPayload;

  const jobFit = snapToAnchor(raw.alignment?.jobFit, [3, 5, 7, 9, 10]);
  const questionFocus = snapToAnchor(raw.alignment?.questionFocus, [3, 5, 7, 9, 10]);
  const alignmentScore =
    raw.alignment?.jobFit !== undefined || raw.alignment?.questionFocus !== undefined
      ? jobFit + questionFocus
      : snapToAnchor(raw.alignment?.score, [6, 10, 14, 17, 20]);

  const evaluation: AIAnchorEvaluation = {
    star: {
      s: snapToAnchor(raw.star?.s, [0, 2, 4, 6]),
      t: snapToAnchor(raw.star?.t, [0, 2, 4, 6]),
      a: snapToAnchor(raw.star?.a, [0, 3, 5, 7]),
      r: snapToAnchor(raw.star?.r, [0, 2, 4, 6]),
      feedback:
        typeof raw.star?.feedback === "string" && raw.star.feedback.trim()
          ? raw.star.feedback.trim()
          : "STAR 구조(상황-과제-행동-결과)의 논리적 연결성을 분석했습니다.",
    },
    metricsRole: {
      roleScore: snapToAnchor(raw.metricsRole?.roleScore, [0, 3, 5, 8]),
      specificityScore: snapToAnchor(raw.metricsRole?.specificityScore, [0, 2, 4, 7]),
      feedback:
        typeof raw.metricsRole?.feedback === "string" && raw.metricsRole.feedback.trim()
          ? raw.metricsRole.feedback.trim()
          : "지원자 본인의 고유 역할과 정량적 기여 근거를 검토했습니다.",
    },
    alignment: {
      score: alignmentScore,
      feedback:
        typeof raw.alignment?.feedback === "string" && raw.alignment.feedback.trim()
          ? raw.alignment.feedback.trim()
          : "지원 직무와 문항 의도에 부합하는 키워드 및 경험 적합도를 분석했습니다.",
    },
    weaknesses:
      Array.isArray(raw.weaknesses) && raw.weaknesses.length > 0
        ? raw.weaknesses.slice(0, 6).map((w) => ({
            categoryKey: String(w.categoryKey || "star"),
            title: String(w.title || "구체성 보완 필요"),
            severity: w.severity === "high" ? "high" : "medium",
            description: String(
              w.description ||
                "상황과 행동의 인과관계를 한 단계 더 구체화하면 설득력이 크게 높아집니다."
            ),
          }))
        : [
            {
              categoryKey: "metrics_role",
              title: "정량 성과 및 본인 고유 역할 비중 부족",
              severity: "high",
              description:
                "팀 단위 서술에서 지원자 본인이 직접 내린 판단과 검증 가능한 변화 수치가 드러나지 않아 경쟁력이 약해 보입니다.",
            },
            {
              categoryKey: "star",
              title: "Action(행동)의 선택 근거 보강 필요",
              severity: "medium",
              description:
                "단순 실행 나열에 그치지 않고, 여러 대안 중 왜 해당 방식을 선택했는지 문제해결 기준을 명시해야 합니다.",
            },
            {
              categoryKey: "alignment",
              title: "직무 핵심 역량 키워드 연결 미흡",
              severity: "medium",
              description:
                "경험에서 얻은 역량이 입사 후 직무 수행에 어떻게 재현되는지 연결 문장이 부족합니다.",
            },
          ],
    sampleFix: {
      title: String(raw.sampleFix?.title || "주도적 행동과 검증 수치 중심 교정 예시"),
      beforeExcerpt: String(raw.sampleFix?.beforeExcerpt || text.trim().slice(0, 110)),
      afterExample: sanitizeUnverifiedNumbers(
        String(
          raw.sampleFix?.afterExample ||
            "프로젝트 일정 지연 원인을 [본인 수치 입력] 기준으로 분류해 우선순위를 재조정했고, 유관 부서 협의를 주도해 마감 기한 내 완수했습니다."
        ),
        text
      ),
      tip: String(
        raw.sampleFix?.tip ||
          "추상적 형용사를 줄이고 '판단 근거 -> 실행 액션 -> 확인된 결과' 순으로 압축하세요."
      ),
    },
  };

  return {
    evaluation,
    usedModel: genResult.usedModel,
    durationMs: genResult.durationMs,
  };
}

export async function generateFourQuestionsResume(options: {
  genAI: GoogleGenerativeAI;
  jobTitle: string;
  memo: string;
  revisionWeaknesses?: string[];
  jobContext?: VerifiedResumeJobContext | null;
  preferredModel?: string;
  perAttemptTimeoutMs?: number;
  fallbackAttemptTimeoutMs?: number;
  totalBudgetMs?: number;
}): Promise<{
  items: ResumeQuestionItem[];
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
  const {
    genAI,
    jobTitle,
    memo,
    revisionWeaknesses,
    jobContext,
    preferredModel,
    perAttemptTimeoutMs = 42_000,
    fallbackAttemptTimeoutMs = 12_000,
    totalBudgetMs = 54_000,
  } = options;

  const isRevision = Array.isArray(revisionWeaknesses) && revisionWeaknesses.length > 0;
  const revisionBlock = isRevision
    ? `\n[진단 리포트 약점 기반 집중 개선 지시]
사용자가 제출한 기존 자소서에서 다음 약점들이 진단되었습니다. 사실관계를 훼손하지 않으면서 아래 약점을 모두 해결한 4문항 완성본을 재구성하세요:
${revisionWeaknesses.map((w, idx) => `${idx + 1}. ${w}`).join("\n")}\n`
    : "";
  const effectiveJobLabel =
    jobTitle.trim() ||
    (jobContext ? `[${jobContext.instName}] ${jobContext.title}` : "") ||
    "공공기관/기업 일반 직무";
  const jobContextBlock = formatJobContextPromptBlock(jobContext, "generate");

  const prompt = `당신은 국내 공기업(NCS)·대기업·스타트업 서류 평가 기준에 정통한 전문 에디터입니다.
지원자의 지원 정보와 경험 메모(또는 기존 자소서 초안)를 바탕으로 **표준 4개 문항 전체 완성본**을 JSON 형식으로 작성해 주세요.

[지원 기업/직무]
${effectiveJobLabel}
${jobContextBlock}
[지원자 입력 경험·원문]
${memo.trim()}
${revisionBlock}
[필수 작성 규칙 - 반드시 준수]
1. 반드시 정확히 다음 4개 문항을 order 1~4 순서대로 items 배열에 생성하세요:
   - id: "q1", order: 1, title: "${STANDARD_RESUME_QUESTIONS[0].title}"
   - id: "q2", order: 2, title: "${STANDARD_RESUME_QUESTIONS[1].title}"
   - id: "q3", order: 3, title: "${STANDARD_RESUME_QUESTIONS[2].title}"
   - id: "q4", order: 4, title: "${STANDARD_RESUME_QUESTIONS[3].title}"
2. 분량 제한: 각 문항 본문(body)은 **공백 포함 450자~550자 내외**(최소 420자, 최대 580자)로 밀도 있게 작성하세요.
3. **절대 금지(허위 수치·성과 창작 및 Zero 표기 금지)**: 지원자 입력 원문에 없는 퍼센트(%), 금액(원/만/억), 건수(건), 인원(명), 배수(배), 소요시간(시간), Zero/0건 등 구체적 수치·성과를 절대 임의로 창작(환각)하지 마세요! 수치를 넣으면 설득력이 높아지는 자리에는 반드시 \`[본인 수치 입력]\` 플레이스홀더(예: \`처리 시간을 [본인 수치 입력] 단축\`)로만 출력해 지원자가 직접 확인·기입하도록 안내하세요.
4. **절대 금지(경험·자격·도구·직책 날조 금지)**: **지원자가 원문에 직접 적은 사실(한 일, 맡은 역할, 사용한 도구, 실제 결과)만 STAR 구조로 다듬고 재구성하세요.** "보조 업무"를 "기준 정립/체계 구축"으로 과장하지 마세요. 공고 요건(자격요건·우대사항)에 맞는 경험·자격증(\`~기사\`, \`컴활\`, \`한국사\` 등)·전문 시스템/툴(\`RMS\`, \`ERP\`, \`SAP\`, \`SQL\`, \`파이썬\` 등)·직책(\`총괄\`, \`팀장\`, \`리드\` 등)이 원문에 없다면 **절대 지어내지 말고 반드시 \`[해당 경험이 있다면 입력: 예) 기록물 분류 기준 적용 경험]\` 형태의 자리표시**로만 남기세요.
5. **블라인드 채용 완벽 준수**: 학교명(OO대 등), 출신 지역, 가족 직업/직위, 성별, 나이, 출생연도를 절대 포함하지 마세요.
6. 각 문항마다 두괄식 소제목이나 핵심 결론 문장을 첫 문장에 배치하고, STAR(상황-과제-행동-결과)가 자연스럽게 연결되도록 서술하세요.`;

  const genResult = await generateContentWithFallback(
    genAI,
    prompt,
    preferredModel || GEMINI_CONFIG.WRITING_MODEL,
    GEMINI_CONFIG.THINKING_LEVEL,
    {
      perAttemptTimeoutMs,
      fallbackAttemptTimeoutMs,
      totalBudgetMs,
      responseMimeType: "application/json",
      responseSchema: DRAFT_RESPONSE_SCHEMA,
    }
  );

  const parsed = JSON.parse(stripMarkdownFences(genResult.text)) as {
    items?: Array<{ id?: string; order?: number; title?: string; body?: string }>;
  };

  const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
  if (rawItems.length === 0) {
    throw new Error("Gemini returned empty items array for 4-question resume");
  }

  const items: ResumeQuestionItem[] = STANDARD_RESUME_QUESTIONS.map((std, index) => {
    const matched =
      rawItems.find((item) => item.id === std.id || item.order === std.order) ||
      rawItems[index];
    const rawBody = (matched?.body || "").trim();
    if (!rawBody) {
      throw new Error(`Missing body for standard question ${std.id}`);
    }
    // 입력 원문에 존재하지 않는 성과 수치 및 미검증 자격증·시스템/툴·과장 직책 후처리 차단
    const cleanBody = sanitizeUnverifiedResumeText(rawBody, memo);
    const metrics = countResumeMetrics(cleanBody, std.targetChars);
    return {
      id: std.id,
      order: std.order,
      title: std.title,
      body: cleanBody,
      charCount: metrics.charCount,
      byteCount: metrics.byteCount2B,
    };
  });

  return {
    items,
    usedModel: genResult.usedModel,
    thinkingLevel: genResult.thinkingLevel,
    attempts: genResult.attempts,
    durationMs: genResult.durationMs,
    usage: genResult.usage,
  };
}

export async function generateTenInterviewQuestions(options: {
  genAI: GoogleGenerativeAI;
  jobTitle: string;
  resumeContext: string;
  jobContext?: VerifiedResumeJobContext | null;
}): Promise<{
  questions: InterviewQuestionItem[];
  usedModel: string;
  thinkingLevel: string;
  attempts: number;
  durationMs: number;
}> {
  const { genAI, jobTitle, resumeContext, jobContext } = options;
  const effectiveJobLabel =
    jobTitle.trim() ||
    (jobContext ? `[${jobContext.instName}] ${jobContext.title}` : "") ||
    "공공기관/기업 일반 직무";
  const jobContextBlock = formatJobContextPromptBlock(jobContext, "interview10");

  const prompt = `당신은 공기업·대기업 면접위원장입니다.
지원자의 지원 직무와 자기소개서(또는 경험 메모) 내용을 정밀 분석하여, 실제 면접장에서 나올 **개인 맞춤형 예상 면접 질문 10개**를 JSON으로 작성해 주세요.

[지원 직무/기관]
${effectiveJobLabel}
${jobContextBlock}
[지원자 자소서/경험 내용]
${resumeContext.trim()}

[출제 구성 규칙]
1. 반드시 number 1부터 10까지 정확히 10개의 질문을 생성하세요.
2. 카테고리 균형 배분:
   - 1~2번: 지원동기 · 기관/산업 이해
   - 3~5번: 직무역량 · 경험 진위 검증 및 압박 꼬리질문
   - 6~7번: 협업 · 갈등 해결 검증
   - 8~9번: 공직윤리 / 규정 준수 / 딜레마 상황대처
   - 10번: 입사 후 포부 · 3분 내 마지막 한마디 검증
3. 각 항목은 반드시 다음 필드를 간결하고 명확하게 포함하세요 (각 필드는 핵심 1문장 40~80자 이내):
   - question: 지원자 실제 경험 맥락을 겨냥한 날카로운 질문
   - intent: 면접관이 이 질문으로 검증하려는 핵심 평가 기준 (1문장)
   - answerTip: 고득점 답변 구조(두괄식 핵심 + 근거 연결 팁 1문장)
4. 블라인드 면접 규칙상 출신 학교·가족·신상을 묻는 질문은 절대 생성하지 마세요.
5. 지원자 자소서/메모 원문에 없는 수치(%)·성과 숫자를 임의로 지어내어 질문이나 답변 팁에 포함하지 마세요.`;

  const genResult = await generateContentWithFallback(
    genAI,
    prompt,
    GEMINI_CONFIG.WRITING_MODEL,
    "low",
    {
      perAttemptTimeoutMs: 28_000,
      totalBudgetMs: 48_000,
      responseMimeType: "application/json",
      responseSchema: INTERVIEW_10_RESPONSE_SCHEMA,
    }
  );

  const parsed = JSON.parse(stripMarkdownFences(genResult.text)) as {
    questions?: Array<Partial<InterviewQuestionItem>>;
  };
  const rawQuestions = Array.isArray(parsed.questions) ? parsed.questions : [];
  if (rawQuestions.length < 5) {
    throw new Error("Gemini returned insufficient interview questions");
  }

  const questions: InterviewQuestionItem[] = rawQuestions.slice(0, 10).map((q, idx) => ({
    number: typeof q.number === "number" ? q.number : idx + 1,
    category: String(q.category || "직무·경험 검증"),
    question: sanitizeInterviewQuestionText(String(q.question || "").trim(), resumeContext),
    intent: sanitizeInterviewQuestionText(
      String(q.intent || "지원 직무 수행 역량 및 사실관계 진위를 검증합니다.").trim(),
      resumeContext
    ),
    answerTip: sanitizeInterviewQuestionText(
      String(q.answerTip || "결론부터 말한 뒤 본인이 수행한 구체적 액션과 근거를 제시하세요.").trim(),
      resumeContext
    ),
  }));

  return {
    questions,
    usedModel: genResult.usedModel,
    thinkingLevel: genResult.thinkingLevel,
    attempts: genResult.attempts,
    durationMs: genResult.durationMs,
  };
}

/**
 * 미결제 미리보기 응답 생성: 1번 문항만 본문 공개, 2~4번 문항 본문은 서버 레벨에서 완전 제거
 */
export function buildLockedPreviewResponse(items: ResumeQuestionItem[]): {
  previewItems: ResumeQuestionItem[];
  lockedItems: LockedResumeQuestionItem[];
} {
  const previewItems = items.slice(0, 1);
  const lockedItems: LockedResumeQuestionItem[] = items.slice(1).map((item, idx) => {
    const std = STANDARD_RESUME_QUESTIONS[idx + 1];
    return {
      id: item.id,
      order: item.order,
      title: item.title,
      targetChars: std?.targetChars ?? 500,
      charCount: item.charCount,
      byteCount: item.byteCount,
      isLocked: true,
    };
  });
  return { previewItems, lockedItems };
}

/**
 * 4문항 완성본 + 10개 면접 질문 패키지 텍스트 직렬화 (.txt 다운로드 및 호환성용)
 */
export function formatFullPackageText(options: {
  jobTitle?: string | null;
  items: ResumeQuestionItem[];
  interviewQuestions: InterviewQuestionItem[];
}): string {
  const { jobTitle, items, interviewQuestions } = options;
  const header = jobTitle ? `[지원 대상] ${jobTitle}\n` : "";

  const resumeSection = items
    .map(
      (item) =>
        `■ ${item.title} (${item.charCount}자 / ${item.byteCount} Byte)\n${item.body}`
    )
    .join("\n\n----------------------------------------\n\n");

  const interviewSection =
    interviewQuestions.length > 0
      ? `\n\n========================================\n[내 경험 기반 예상 면접 질문 ${interviewQuestions.length}선 & 답변 팁]\n========================================\n\n` +
        interviewQuestions
          .map(
            (q) =>
              `Q${q.number}. [${q.category}] ${q.question}\n- 출제 의도: ${q.intent}\n- 답변 가이드: ${q.answerTip}`
          )
          .join("\n\n")
      : "";

  return `${header}========================================\n[AI 자소서 4문항 완성본]\n========================================\n\n${resumeSection}${interviewSection}`.trim();
}
