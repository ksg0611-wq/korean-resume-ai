import {
  INTERVIEW_FREE_SESSION_TTL_SECONDS,
  INTERVIEW_MAX_EVALUATIONS,
  INTERVIEW_PAID_SESSION_TTL_SECONDS,
} from "@/lib/policy";
import { requireRedisClient } from "@/lib/redis";
import {
  generateSecureToken,
  type InterviewPrepFollowUpNote,
  type InterviewPrepNote,
  type InterviewPrepNoteEntry,
} from "@/lib/results";
import type {
  AnswerEvaluationReport,
  FollowUpPrompt,
  SimulatorQuestion,
} from "@/lib/interviewRubric";

export interface ThreadFollowUpRecord {
  depth: 1 | 2 | 3;
  ncsCompetency: string;
  focus: string;
  question: string;
  userAnswer?: string | null;
  evaluation?: AnswerEvaluationReport | null;
  evaluatedAt?: string | null;
}

export interface QuestionThreadRecord {
  questionId: string;
  initialAnswer?: string | null;
  initialEvaluation?: AnswerEvaluationReport | null;
  initialEvaluatedAt?: string | null;
  followUps: ThreadFollowUpRecord[];
}

export interface InterviewJobContext {
  sn?: number;
  instName: string;
  title: string;
  ncsNames: string[];
  qualification?: string | null;
  preference?: string | null;
  procedureInfo?: string | null;
}

export interface InterviewSessionRecord {
  sessionId: string;
  orderId: string | null;
  isFree: boolean;
  jobCategory: string;
  jobContext?: InterviewJobContext | null;
  resumeText: string;
  selfIntroScript?: string | null;
  selfIntroHook?: string | null;
  selfIntroTips?: string[];
  selfIntroGenCount?: number;
  questions: SimulatorQuestion[];
  threads: Record<string, QuestionThreadRecord>;
  maxEvaluations: number;
  usedEvaluations: number;
  remainingEvaluations: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface EvalQuotaState {
  isFree: number; // 1 | 0
  max: number;
  used: number;
  remaining: number;
}

export const INTERVIEW_EVAL_LOCK_TTL_SECONDS = 60;

export function getInterviewSessionKey(sessionId: string): string {
  return `interview_session:${sessionId}`;
}

export function getInterviewQuotaKey(sessionId: string): string {
  return `interview_quota:${sessionId}`;
}

export function getInterviewSessionLockKey(sessionId: string): string {
  return `lock:interview_session:${sessionId}`;
}

const RESERVE_EVAL_LUA = `
local sessionRaw = redis.call("GET", KEYS[1])
if not sessionRaw then
  return cjson.encode({ ok = false, status = 410, code = "SESSION_EXPIRED", message = "면접 세션이 만료되었습니다. 새로 질문을 생성해 주세요." })
end

local quotaRaw = redis.call("GET", KEYS[2])
if not quotaRaw then
  return cjson.encode({ ok = false, status = 410, code = "SESSION_EXPIRED", message = "면접 세션 한도 정보가 만료되었습니다." })
end

local existingLock = redis.call("GET", KEYS[3])
if existingLock ~= false then
  return cjson.encode({ ok = false, status = 409, code = "EVAL_IN_PROGRESS", message = "이전 답변 채점이 진행 중입니다. 잠시만 기다려 주세요." })
end

local okQ, quota = pcall(cjson.decode, quotaRaw)
if not okQ or type(quota) ~= "table" then
  return cjson.encode({ ok = false, status = 500, code = "QUOTA_CORRUPT", message = "세션 한도 정보를 읽을 수 없습니다." })
end

local depth = tonumber(ARGV[1]) or 0
local lockToken = ARGV[2]
local lockTtl = tonumber(ARGV[3]) or 60

local isFree = tonumber(quota.isFree) or 0
local maxEval = tonumber(quota.max) or 45
local used = tonumber(quota.used) or 0
local remaining = tonumber(quota.remaining) or 0

if depth < 0 or depth > 3 then
  return cjson.encode({ ok = false, status = 400, code = "INVALID_FOLLOWUP_DEPTH", message = "꼬리질문은 최대 3단계까지만 지원됩니다." })
end

if isFree == 1 then
  if depth > 0 then
    return cjson.encode({ ok = false, status = 403, code = "FREE_FOLLOWUP_LOCKED", message = "꼬리질문 실전 답변 및 2~3단계 연쇄 검증은 유료 시뮬레이터에서 이용할 수 있습니다." })
  end
  if used >= 1 or remaining < 1 then
    return cjson.encode({ ok = false, status = 403, code = "FREE_EVAL_LIMIT_EXCEEDED", message = "무료 체험에서는 1개 질문의 답변 채점과 1단계 꼬리질문 미리보기까지만 제공됩니다." })
  end
else
  if remaining < 1 or used >= maxEval then
    return cjson.encode({ ok = false, status = 429, code = "EVALUATION_LIMIT_EXCEEDED", message = "세션당 최대 45회(15문항 × 3단계) 답변 채점 한도를 모두 소진했습니다." })
  end
end

quota.used = used + 1
quota.remaining = remaining - 1

local ttl = redis.call("TTL", KEYS[1])
if ttl and ttl > 0 then
  redis.call("SET", KEYS[2], cjson.encode(quota), "EX", ttl)
else
  redis.call("SET", KEYS[2], cjson.encode(quota))
end
redis.call("SET", KEYS[3], lockToken, "EX", lockTtl)

return cjson.encode({
  ok = true,
  quota = quota,
  sessionRaw = sessionRaw
})
`;

const COMMIT_SESSION_LUA = `
local currentLock = redis.call("GET", KEYS[3])
local expectedToken = ARGV[2]
if currentLock ~= false and expectedToken ~= "" and currentLock ~= expectedToken then
  return 0
end

local ttl = redis.call("TTL", KEYS[1])
if ttl and ttl > 0 then
  redis.call("SET", KEYS[1], ARGV[1], "EX", ttl)
else
  local fallbackTtl = tonumber(ARGV[3]) or 7200
  redis.call("SET", KEYS[1], ARGV[1], "EX", fallbackTtl)
end

if expectedToken == "" or currentLock == expectedToken then
  redis.call("DEL", KEYS[3])
end
return 1
`;

const REFUND_EVAL_LUA = `
local quotaRaw = redis.call("GET", KEYS[2])
local lockToken = ARGV[1]
local currentLock = redis.call("GET", KEYS[3])

if currentLock == lockToken or lockToken == "" then
  redis.call("DEL", KEYS[3])
end

if not quotaRaw then
  return cjson.encode({ ok = false })
end

local okQ, quota = pcall(cjson.decode, quotaRaw)
if not okQ or type(quota) ~= "table" then
  return cjson.encode({ ok = false })
end

local maxEval = tonumber(quota.max) or 45
local used = tonumber(quota.used) or 0
local remaining = tonumber(quota.remaining) or 0

quota.used = math.max(0, used - 1)
quota.remaining = math.min(maxEval, remaining + 1)

local ttl = redis.call("TTL", KEYS[1])
if ttl and ttl > 0 then
  redis.call("SET", KEYS[2], cjson.encode(quota), "EX", ttl)
else
  redis.call("SET", KEYS[2], cjson.encode(quota))
end

return cjson.encode({ ok = true, quota = quota })
`;

function normalizeSession(raw: InterviewSessionRecord): InterviewSessionRecord {
  const safeQuestions = Array.isArray(raw.questions) ? raw.questions : [];
  const safeThreads: Record<string, QuestionThreadRecord> = {};
  if (raw.threads && typeof raw.threads === "object") {
    for (const [k, v] of Object.entries(raw.threads)) {
      if (!v || typeof v !== "object") continue;
      safeThreads[k] = {
        questionId: v.questionId || k,
        initialAnswer: v.initialAnswer ?? null,
        initialEvaluation: v.initialEvaluation ?? null,
        initialEvaluatedAt: v.initialEvaluatedAt ?? null,
        followUps: Array.isArray(v.followUps) ? v.followUps : [],
      };
    }
  }
  return {
    ...raw,
    questions: safeQuestions,
    threads: safeThreads,
  };
}

export async function createInterviewSession(options: {
  isFree: boolean;
  orderId?: string | null;
  jobCategory: string;
  jobContext?: InterviewJobContext | null;
  resumeText: string;
  questions: SimulatorQuestion[];
}): Promise<InterviewSessionRecord> {
  const redis = requireRedisClient();
  const sessionId = generateSecureToken();
  const ttlSeconds = options.isFree
    ? INTERVIEW_FREE_SESSION_TTL_SECONDS
    : INTERVIEW_PAID_SESSION_TTL_SECONDS;
  const maxEvaluations = options.isFree ? 1 : INTERVIEW_MAX_EVALUATIONS;

  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAtIso = new Date(now.getTime() + ttlSeconds * 1000).toISOString();

  const session: InterviewSessionRecord = {
    sessionId,
    orderId: options.orderId ?? null,
    isFree: options.isFree,
    jobCategory: options.jobCategory,
    ...(options.jobContext ? { jobContext: options.jobContext } : {}),
    resumeText: options.resumeText,
    questions: options.questions,
    threads: {},
    maxEvaluations,
    usedEvaluations: 0,
    remainingEvaluations: maxEvaluations,
    createdAt: nowIso,
    updatedAt: nowIso,
    expiresAt: expiresAtIso,
  };

  const quota: EvalQuotaState = {
    isFree: options.isFree ? 1 : 0,
    max: maxEvaluations,
    used: 0,
    remaining: maxEvaluations,
  };

  await redis.set(getInterviewSessionKey(sessionId), session, { ex: ttlSeconds });
  await redis.set(getInterviewQuotaKey(sessionId), quota, { ex: ttlSeconds });

  return session;
}

export async function getInterviewSession(
  sessionId: string
): Promise<InterviewSessionRecord | null> {
  const cleanId = sessionId.trim();
  if (!cleanId) return null;
  const redis = requireRedisClient();
  const [rawSession, rawQuota] = await Promise.all([
    redis.get<InterviewSessionRecord>(getInterviewSessionKey(cleanId)),
    redis.get<EvalQuotaState>(getInterviewQuotaKey(cleanId)),
  ]);

  if (!rawSession || typeof rawSession !== "object") {
    return null;
  }

  const normalized = normalizeSession(rawSession);
  if (rawQuota && typeof rawQuota === "object") {
    normalized.maxEvaluations = rawQuota.max ?? normalized.maxEvaluations;
    normalized.usedEvaluations = rawQuota.used ?? normalized.usedEvaluations;
    normalized.remainingEvaluations =
      rawQuota.remaining ?? normalized.remainingEvaluations;
  }
  return normalized;
}

export type ReserveEvalResult =
  | {
      ok: true;
      session: InterviewSessionRecord;
      quota: EvalQuotaState;
      lockToken: string;
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
    };

export async function reserveInterviewEvaluation(options: {
  sessionId: string;
  depth: 0 | 1 | 2 | 3;
}): Promise<ReserveEvalResult> {
  const redis = requireRedisClient();
  const cleanId = options.sessionId.trim();
  const lockToken = generateSecureToken();

  const raw = await redis.eval<string[], string | Record<string, any>>(
    RESERVE_EVAL_LUA,
    [
      getInterviewSessionKey(cleanId),
      getInterviewQuotaKey(cleanId),
      getInterviewSessionLockKey(cleanId),
    ],
    [String(options.depth), lockToken, String(INTERVIEW_EVAL_LOCK_TTL_SECONDS)]
  );

  const parsed =
    typeof raw === "string" ? (JSON.parse(raw) as Record<string, any>) : raw;

  if (!parsed || !parsed.ok) {
    return {
      ok: false,
      status: Number(parsed?.status || 500),
      code: String(parsed?.code || "EVAL_RESERVE_FAILED"),
      message: String(
        parsed?.message || "면접 답변 채점을 준비하는 중 오류가 발생했습니다."
      ),
    };
  }

  const parsedSessionRaw =
    typeof parsed.sessionRaw === "string"
      ? (JSON.parse(parsed.sessionRaw) as InterviewSessionRecord)
      : (parsed.sessionRaw as InterviewSessionRecord);

  const quota: EvalQuotaState = parsed.quota;
  const session = normalizeSession(parsedSessionRaw);
  session.maxEvaluations = quota.max;
  session.usedEvaluations = quota.used;
  session.remainingEvaluations = quota.remaining;

  return {
    ok: true,
    session,
    quota,
    lockToken,
  };
}

export async function commitInterviewEvaluation(options: {
  session: InterviewSessionRecord;
  questionId: string;
  depth: 0 | 1 | 2 | 3;
  userAnswer: string;
  report: AnswerEvaluationReport;
  quota: EvalQuotaState;
  lockToken: string;
}): Promise<InterviewSessionRecord> {
  const redis = requireRedisClient();
  const { session, questionId, depth, userAnswer, report, quota, lockToken } =
    options;
  const nowIso = new Date().toISOString();

  const existingThread: QuestionThreadRecord = session.threads[questionId] || {
    questionId,
    followUps: [],
  };

  let updatedFollowUps = [...existingThread.followUps];

  if (depth === 0) {
    // 1단계 꼬리질문 미리보기/질문 추가 또는 갱신
    if (report.nextFollowUp) {
      const nextFollow = report.nextFollowUp;
      const existingIdx = updatedFollowUps.findIndex((f) => f.depth === 1);
      const entry: ThreadFollowUpRecord = {
        depth: 1,
        ncsCompetency: nextFollow.ncsCompetency,
        focus: nextFollow.focus,
        question: nextFollow.question,
        userAnswer: existingIdx >= 0 ? updatedFollowUps[existingIdx].userAnswer : null,
        evaluation: existingIdx >= 0 ? updatedFollowUps[existingIdx].evaluation : null,
        evaluatedAt: existingIdx >= 0 ? updatedFollowUps[existingIdx].evaluatedAt : null,
      };
      if (existingIdx >= 0) {
        updatedFollowUps[existingIdx] = entry;
      } else {
        updatedFollowUps.push(entry);
      }
    }
  } else {
    // depth 1, 2, 3 꼬리질문에 대한 답변 & 채점 반영
    const idx = updatedFollowUps.findIndex((f) => f.depth === depth);
    if (idx >= 0) {
      updatedFollowUps[idx] = {
        ...updatedFollowUps[idx],
        userAnswer,
        evaluation: report,
        evaluatedAt: nowIso,
      };
    } else {
      updatedFollowUps.push({
        depth,
        ncsCompetency: "문제해결능력",
        focus: "직전 답변 심화 확인",
        question: `${depth}단계 꼬리질문`,
        userAnswer,
        evaluation: report,
        evaluatedAt: nowIso,
      });
    }

    // 다음 단계(depth + 1) 꼬리질문이 생성된 경우 추가
    if (report.nextFollowUp && report.nextFollowUp.depth <= 3) {
      const nextFollow: FollowUpPrompt = report.nextFollowUp;
      const nextIdx = updatedFollowUps.findIndex((f) => f.depth === nextFollow.depth);
      const nextEntry: ThreadFollowUpRecord = {
        depth: nextFollow.depth,
        ncsCompetency: nextFollow.ncsCompetency,
        focus: nextFollow.focus,
        question: nextFollow.question,
        userAnswer: nextIdx >= 0 ? updatedFollowUps[nextIdx].userAnswer : null,
        evaluation: nextIdx >= 0 ? updatedFollowUps[nextIdx].evaluation : null,
        evaluatedAt: nextIdx >= 0 ? updatedFollowUps[nextIdx].evaluatedAt : null,
      };
      if (nextIdx >= 0) {
        updatedFollowUps[nextIdx] = nextEntry;
      } else {
        updatedFollowUps.push(nextEntry);
      }
    }
  }

  updatedFollowUps = updatedFollowUps.sort((a, b) => a.depth - b.depth);

  const updatedThread: QuestionThreadRecord =
    depth === 0
      ? {
          ...existingThread,
          initialAnswer: userAnswer,
          initialEvaluation: report,
          initialEvaluatedAt: nowIso,
          followUps: updatedFollowUps,
        }
      : {
          ...existingThread,
          followUps: updatedFollowUps,
        };

  const updatedSession: InterviewSessionRecord = {
    ...session,
    threads: {
      ...session.threads,
      [questionId]: updatedThread,
    },
    maxEvaluations: quota.max,
    usedEvaluations: quota.used,
    remainingEvaluations: quota.remaining,
    updatedAt: nowIso,
  };

  const fallbackTtl = session.isFree
    ? INTERVIEW_FREE_SESSION_TTL_SECONDS
    : INTERVIEW_PAID_SESSION_TTL_SECONDS;

  await redis.eval(
    COMMIT_SESSION_LUA,
    [
      getInterviewSessionKey(session.sessionId),
      getInterviewQuotaKey(session.sessionId),
      getInterviewSessionLockKey(session.sessionId),
    ],
    [JSON.stringify(updatedSession), lockToken, String(fallbackTtl)]
  );

  return updatedSession;
}

export async function refundInterviewEvaluation(options: {
  sessionId: string;
  lockToken: string;
}): Promise<EvalQuotaState | null> {
  const redis = requireRedisClient();
  const cleanId = options.sessionId.trim();
  const raw = await redis.eval<string[], string | Record<string, any>>(
    REFUND_EVAL_LUA,
    [
      getInterviewSessionKey(cleanId),
      getInterviewQuotaKey(cleanId),
      getInterviewSessionLockKey(cleanId),
    ],
    [options.lockToken]
  );

  const parsed =
    typeof raw === "string" ? (JSON.parse(raw) as Record<string, any>) : raw;
  return parsed?.ok && parsed?.quota ? (parsed.quota as EvalQuotaState) : null;
}

export async function saveSessionSelfIntro(options: {
  sessionId: string;
  script: string;
  hookSummary: string;
  speakingTips: string[];
}): Promise<InterviewSessionRecord | null> {
  const redis = requireRedisClient();
  const sessionKey = getInterviewSessionKey(options.sessionId.trim());
  const existing = await getInterviewSession(options.sessionId);
  if (!existing) return null;

  const currentTtl = await redis.ttl(sessionKey);
  const fallbackTtl = existing.isFree
    ? INTERVIEW_FREE_SESSION_TTL_SECONDS
    : INTERVIEW_PAID_SESSION_TTL_SECONDS;

  const updated: InterviewSessionRecord = {
    ...existing,
    selfIntroScript: options.script,
    selfIntroHook: options.hookSummary,
    selfIntroTips: options.speakingTips,
    selfIntroGenCount: (existing.selfIntroGenCount ?? 0) + 1,
    updatedAt: new Date().toISOString(),
  };

  await redis.set(sessionKey, updated, {
    ex: currentTtl > 0 ? currentTtl : fallbackTtl,
  });
  return updated;
}

/**
 * 현재 세션 상태를 면접 대비 노트 구조(15문항 + 1분 자기소개 + 내 답변 + 교정 답변 + 꼬리질문 1~3단계 + 일관성 점검)로 컴파일
 */
export function compileInterviewPrepNote(
  session: InterviewSessionRecord
): InterviewPrepNote {
  let answeredCount = 0;

  const buildEntry = (q: SimulatorQuestion): InterviewPrepNoteEntry => {
    const thread = session.threads[q.id];
    const initEval = thread?.initialEvaluation ?? null;

    if (thread?.initialAnswer) {
      answeredCount += 1;
    }

    const followUps: InterviewPrepFollowUpNote[] = (thread?.followUps || []).map(
      (f) => ({
        depth: f.depth,
        ncsCompetency: f.ncsCompetency,
        focus: f.focus,
        question: f.question,
        userAnswer: f.userAnswer ?? null,
        totalScore: f.evaluation?.totalScore ?? null,
        consistencyLabel: f.evaluation?.consistency?.statusLabel ?? null,
        consistencyReason:
          f.evaluation?.consistency?.mismatches?.[0]?.reason ?? null,
        feedback3Lines: f.evaluation?.feedback3Lines,
        digPoint: f.evaluation?.digPoint ?? null,
        modelAnswer: f.evaluation?.modelAnswer ?? null,
      })
    );

    return {
      questionId: q.id,
      number: q.number,
      kind: q.kind,
      ncsCompetency: q.ncsCompetency,
      intentSummary: q.intentSummary,
      question: q.question,
      userAnswer: thread?.initialAnswer ?? null,
      totalScore: initEval?.totalScore ?? null,
      consistencyApplied: initEval?.consistencyApplied,
      consistencyLabel: initEval?.consistency?.statusLabel ?? null,
      consistencyReason:
        initEval?.consistency?.mismatches?.[0]?.reason ??
        (initEval?.consistency?.applicable === false
          ? "해당 없음 (85→100점 환산 적용)"
          : null),
      feedback3Lines: initEval?.feedback3Lines,
      digPoint: initEval?.digPoint ?? null,
      modelAnswer: initEval?.modelAnswer ?? null,
      followUps,
    };
  };

  const entries: InterviewPrepNoteEntry[] = session.questions.map(buildEntry);

  const selfIntroThread = session.threads["self_intro"];
  let selfIntroEntry: InterviewPrepNoteEntry | null = null;
  if (selfIntroThread || session.selfIntroScript) {
    selfIntroEntry = buildEntry({
      id: "self_intro",
      number: 0,
      kind: "self_intro",
      ncsCompetency: "의사소통능력",
      intentSummary:
        session.selfIntroHook ||
        "1분 자기소개 대본의 두괄식 구조·직무 연결성·발화 분량 적정성 점검",
      question: "1분 자기소개 대본 (권장 250~330자 · 약 50~60초)",
    });
    if (!selfIntroEntry.userAnswer && session.selfIntroScript) {
      selfIntroEntry.modelAnswer = session.selfIntroScript;
    }
  }

  return {
    sessionId: session.sessionId,
    jobCategory: session.jobCategory,
    totalQuestions: session.questions.length,
    answeredCount,
    maxEvaluations: session.maxEvaluations,
    usedEvaluations: session.usedEvaluations,
    remainingEvaluations: session.remainingEvaluations,
    updatedAt: session.updatedAt,
    ...(selfIntroEntry ? { selfIntroEntry } : {}),
    entries,
  };
}

/**
 * 7일 재열람 화면 및 .txt 다운로드용 면접 대비 노트 텍스트 포매터
 */
export function formatInterviewNoteText(note: InterviewPrepNote): string {
  const lines: string[] = [];
  lines.push("====================================================");
  lines.push(`공공기관 AI 면접 시뮬레이터 대비 노트 (${note.jobCategory})`);
  lines.push(
    `문항 수: 총 ${note.totalQuestions}문항 · 답변 완료: ${note.answeredCount}문항 · 채점 사용: ${note.usedEvaluations}/${note.maxEvaluations}회`
  );
  lines.push(`최종 업데이트: ${note.updatedAt}`);
  lines.push("====================================================");
  lines.push("");

  const jobEntries = note.entries.filter((e) => e.kind === "job");
  const persEntries = note.entries.filter((e) => e.kind === "personality");

  const renderSection = (title: string, list: InterviewPrepNoteEntry[]) => {
    if (list.length === 0) return;
    lines.push(`[${title}]`);
    lines.push("");
    for (const entry of list) {
      lines.push(
        `Q${entry.number}. [${entry.ncsCompetency}] ${entry.question}`
      );
      lines.push(`- 검증 의도: ${entry.intentSummary}`);
      if (entry.userAnswer) {
        lines.push(`- 내 답변: ${entry.userAnswer}`);
        lines.push(
          `- 채점 결과: ${entry.totalScore ?? "-"}점 / 100점 · 일관성: ${entry.consistencyLabel || "-"}`
        );
        if (entry.consistencyReason) {
          lines.push(`  · 일관성 상세: ${entry.consistencyReason}`);
        }
        if (entry.feedback3Lines && entry.feedback3Lines.length > 0) {
          lines.push("- 면접관 피드백:");
          for (const fb of entry.feedback3Lines) {
            lines.push(`  · ${fb}`);
          }
        }
        if (entry.digPoint) {
          lines.push(`- 파고들 지점: ${entry.digPoint}`);
        }
        if (entry.modelAnswer) {
          lines.push(`- 교정 모범 답변: ${entry.modelAnswer}`);
        }
      } else {
        lines.push("- 상태: 아직 답변 연습 전 (재열람 화면 '이어서 연습하기'로 답변 채점 가능)");
      }

      if (entry.followUps.length > 0) {
        for (const f of entry.followUps) {
          lines.push(
            `  [꼬리질문 ${f.depth}단계 · ${f.ncsCompetency}] ${f.question}`
          );
          if (f.userAnswer) {
            lines.push(
              `    · 내 답변(${f.totalScore ?? "-"}점): ${f.userAnswer}`
            );
            if (f.modelAnswer) {
              lines.push(`    · 교정 답변: ${f.modelAnswer}`);
            }
          }
        }
      }
      lines.push("");
    }
  };

  if (note.selfIntroEntry) {
    renderSection("PART 0. 1분 자기소개 대본 및 평가", [note.selfIntroEntry]);
  }
  renderSection("PART 1. 직무·경험 심층 면접 10문항", jobEntries);
  renderSection("PART 2. 공공기관 인성·조직적합성 5문항", persEntries);

  return lines.join("\n");
}
