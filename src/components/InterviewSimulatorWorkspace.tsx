"use client";

import { useState, type ReactNode } from "react";
import type { AnswerEvaluationReport } from "@/lib/interviewRubric";
import type { InterviewSessionRecord } from "@/lib/interviewSession";

interface InterviewSimulatorWorkspaceProps {
  session: InterviewSessionRecord;
  onSessionUpdate: (updatedSession: InterviewSessionRecord) => void;
  onUnlockClick?: () => void;
}

function EvaluationReportCard({
  report,
  onUnlockClick,
}: {
  report: AnswerEvaluationReport;
  onUnlockClick?: () => void;
}) {
  const [copiedModel, setCopiedModel] = useState(false);

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopiedModel(true);
    setTimeout(() => setCopiedModel(false), 2000);
  };

  const consistencyBadgeCls =
    report.consistency.statusLabel === "불일치 발견"
      ? "bg-red-50 text-red-800 border-red-200"
      : report.consistency.statusLabel === "해당 없음"
        ? "bg-slate-100 text-slate-700 border-slate-200"
        : "bg-emerald-50 text-emerald-800 border-emerald-200";

  return (
    <div className="mt-4 bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs">
      {/* 상단 점수 + 일관성 배지 */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white flex flex-col items-center justify-center shrink-0">
            <span className="text-xl font-black leading-none">{report.totalScore}</span>
            <span className="text-[10px] font-semibold opacity-90">/ 100점</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-xs font-extrabold">
                등급 {report.grade}
              </span>
              <span className="text-xs font-semibold text-gray-500">
                {report.charCount}자 (약 {report.estimatedSpeechSeconds ?? Math.max(1, Math.round(report.charCount / 5.2))}초) · 수치 {report.metricCount}건
              </span>
            </div>
            <p className="text-[11px] text-gray-500 mt-1">
              {report.scoreFormulaNote}
            </p>
          </div>
        </div>

        <span
          className={`px-3 py-1 rounded-lg border text-xs font-bold ${consistencyBadgeCls}`}
        >
          일관성: {report.consistency.statusLabel}
        </span>
      </div>

      {/* 5개 항목별 점수 바 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
        {report.categories.map((cat) => (
          <div
            key={cat.key}
            className="bg-gray-50 border border-gray-200/80 rounded-xl p-2.5 flex flex-col gap-1"
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[11px] font-bold text-gray-700 truncate">
                {cat.name}
              </span>
              <span className="text-xs font-extrabold text-gray-900 shrink-0">
                {cat.applicable && cat.score !== null
                  ? `${cat.score}/${cat.maxScore}`
                  : "해당 없음"}
              </span>
            </div>
            <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  !cat.applicable
                    ? "bg-slate-400"
                    : (cat.score ?? 0) / cat.maxScore >= 0.8
                      ? "bg-emerald-500"
                      : (cat.score ?? 0) / cat.maxScore >= 0.55
                        ? "bg-blue-500"
                        : "bg-amber-500"
                }`}
                style={{
                  width:
                    cat.applicable && cat.score !== null
                      ? `${Math.min(100, Math.round((cat.score / cat.maxScore) * 100))}%`
                      : "100%",
                }}
              />
            </div>
            <span className="text-[10px] text-gray-500">{cat.label}</span>
          </div>
        ))}
      </div>

      {/* 자소서↔답변 일관성 상세 (불일치 발생 시 원문 인용 쌍 + 사유 출력) */}
      {report.consistency.statusLabel === "불일치 발견" &&
        report.consistency.mismatches.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 space-y-2.5">
            <p className="text-xs font-extrabold text-red-900">
              자소서 ↔ 답변 불일치 지점 감지 ({report.consistency.mismatches.length}건)
            </p>
            {report.consistency.mismatches.map((m, idx) => (
              <div
                key={idx}
                className="bg-white border border-red-100 rounded-lg p-3 text-xs space-y-1.5"
              >
                <span className="inline-block px-2 py-0.5 rounded bg-red-100 text-red-800 font-bold text-[10px]">
                  유형: {m.category}
                </span>
                <p className="text-gray-700">
                  <strong className="text-gray-900">자소서 인용:</strong> &ldquo;{m.resumeQuote}&rdquo;
                </p>
                <p className="text-gray-700">
                  <strong className="text-gray-900">답변 인용:</strong> &ldquo;{m.answerQuote}&rdquo;
                </p>
                <p className="text-red-700 font-semibold">
                  불일치 사유: {m.reason}
                </p>
              </div>
            ))}
          </div>
        )}

      {/* 면접관 피드백 3줄 & 파고들 지점 1개 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-3.5 space-y-2">
          <p className="text-xs font-extrabold text-blue-900">
            면접관 핵심 피드백 3줄
          </p>
          <ul className="space-y-1.5 text-xs text-gray-800 leading-relaxed">
            {report.feedback3Lines.map((line, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="font-bold text-blue-600 shrink-0">{i + 1}.</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5 space-y-2">
          <p className="text-xs font-extrabold text-amber-900">
            면접관이 파고들 핵심 지점 (압박 포인트)
          </p>
          <p className="text-xs text-amber-950 leading-relaxed">
            {report.digPoint}
          </p>
        </div>
      </div>

      {/* 모범(교정) 답변 예시 */}
      {report.modelAnswerLocked ? (
        <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold text-gray-800">
              🔒 교정 모범 답변 예시 (유료 시뮬레이터에서 공개)
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              무료 체험에서는 점수와 3줄 피드백, 1단계 꼬리질문 미리보기까지만 제공됩니다.
            </p>
          </div>
          {onUnlockClick && (
            <button
              type="button"
              onClick={onUnlockClick}
              className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shrink-0 cursor-pointer"
            >
              4,900원으로 전체 잠금해제
            </button>
          )}
        </div>
      ) : (
        report.modelAnswer && (
          <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-extrabold text-emerald-900">
                STAR 교정 모범 답변 예시
              </p>
              <button
                type="button"
                onClick={() => handleCopy(report.modelAnswer!)}
                className="text-[11px] font-bold px-2.5 py-1 rounded bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100 cursor-pointer"
              >
                {copiedModel ? "복사됨 ✓" : "답변 복사"}
              </button>
            </div>
            <p className="text-xs sm:text-sm text-gray-800 leading-relaxed whitespace-pre-wrap select-text">
              {report.modelAnswer}
            </p>
            {report.modelAnswer.includes("[본인 수치 입력]") && (
              <p className="text-[11px] text-emerald-800 font-semibold">
                ※ 확인되지 않은 수치를 임의로 만들지 않도록 [본인 수치 입력] 표기 자리에 실제 경험 숫자를 채워 활용해 주세요.
              </p>
            )}
          </div>
        )
      )}
    </div>
  );
}

export default function InterviewSimulatorWorkspace({
  session,
  onSessionUpdate,
  onUnlockClick,
}: InterviewSimulatorWorkspaceProps) {
  const [simulatorTab, setSimulatorTab] = useState<"questions" | "self_intro">(
    "questions"
  );
  const [kindFilter, setKindFilter] = useState<"all" | "job" | "personality">("all");
  const [selectedQuestionId, setSelectedQuestionId] = useState<string>(
    session.questions[0]?.id || "q1"
  );
  const [draftAnswers, setDraftAnswers] = useState<Record<string, string>>({});
  const [submittingKey, setSubmittingKey] = useState<string | null>(null);
  const [isGeneratingSelfIntro, setIsGeneratingSelfIntro] = useState(false);
  const [evalError, setEvalError] = useState("");
  const [lastDurationMs, setLastDurationMs] = useState<number | null>(null);

  const selectedQuestion =
    session.questions.find((q) => q.id === selectedQuestionId) ||
    session.questions[0];

  const activeThread =
    simulatorTab === "self_intro"
      ? session.threads["self_intro"]
      : selectedQuestion
        ? session.threads[selectedQuestion.id]
        : undefined;

  const filteredQuestions = session.questions.filter((q) =>
    kindFilter === "all" ? true : q.kind === kindFilter
  );

  const jobCount = session.questions.filter((q) => q.kind === "job").length;
  const personalityCount = session.questions.filter(
    (q) => q.kind === "personality"
  ).length;

  const getDraft = (key: string, fallback?: string | null) =>
    draftAnswers[key] ?? fallback ?? "";

  const setDraft = (key: string, val: string) => {
    setDraftAnswers((prev) => ({ ...prev, [key]: val }));
    if (evalError) setEvalError("");
  };

  const handleGenerateSelfIntro = async () => {
    if (session.isFree) {
      onUnlockClick?.();
      return;
    }
    setIsGeneratingSelfIntro(true);
    setEvalError("");
    try {
      const res = await fetch("/api/interview/self-intro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.sessionId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setEvalError(
          data?.error || "1분 자기소개 대본 생성에 실패했습니다. 다시 시도해 주세요."
        );
        return;
      }
      if (typeof data.script === "string") {
        setDraft("self_intro:0", data.script);
      }
      if (data.session) {
        onSessionUpdate(data.session);
      }
    } catch {
      setEvalError("네트워크 오류로 1분 자기소개 대본을 생성하지 못했습니다.");
    } finally {
      setIsGeneratingSelfIntro(false);
    }
  };

  const handleEvaluate = async (
    questionId: string,
    depth: 0 | 1 | 2 | 3,
    draftKey: string,
    fallbackText?: string | null
  ) => {
    const answerText = getDraft(draftKey, fallbackText).trim();
    const isSelfIntro = questionId === "self_intro" && depth === 0;
    const minChars = isSelfIntro ? 80 : 100;
    const maxChars = isSelfIntro ? 600 : 800;

    if (answerText.length < minChars || answerText.length > maxChars) {
      setEvalError(
        isSelfIntro
          ? `1분 자기소개 대본은 공백 포함 80자 이상 600자 이내로 입력해 주세요. (현재 ${answerText.length}자)`
          : `면접 답변은 공백 포함 100자 이상 800자 이내로 입력해 주세요. (현재 ${answerText.length}자)`
      );
      return;
    }

    setSubmittingKey(draftKey);
    setEvalError("");

    try {
      const res = await fetch("/api/interview/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.sessionId,
          questionId,
          depth,
          userAnswer: answerText,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setEvalError(data?.error || "답변 채점에 실패했습니다. 다시 시도해 주세요.");
        return;
      }

      if (typeof data.durationMs === "number") {
        setLastDurationMs(data.durationMs);
      }

      // 세션 로컬 상태 즉시 동기화 (Redis와 동일 구조)
      const report: AnswerEvaluationReport = data.report;
      const existingThread = session.threads[questionId] || {
        questionId,
        followUps: [],
      };
      let nextFollowUps = [...existingThread.followUps];

      if (depth === 0) {
        if (report.nextFollowUp) {
          const nf = report.nextFollowUp;
          const idx = nextFollowUps.findIndex((f) => f.depth === 1);
          const item = {
            depth: 1 as const,
            ncsCompetency: nf.ncsCompetency,
            focus: nf.focus,
            question: nf.question,
            userAnswer: idx >= 0 ? nextFollowUps[idx].userAnswer : null,
            evaluation: idx >= 0 ? nextFollowUps[idx].evaluation : null,
          };
          if (idx >= 0) nextFollowUps[idx] = item;
          else nextFollowUps.push(item);
        }
      } else {
        const idx = nextFollowUps.findIndex((f) => f.depth === depth);
        if (idx >= 0) {
          nextFollowUps[idx] = {
            ...nextFollowUps[idx],
            userAnswer: answerText,
            evaluation: report,
          };
        }
        if (report.nextFollowUp && report.nextFollowUp.depth <= 3) {
          const nf = report.nextFollowUp;
          const nIdx = nextFollowUps.findIndex((f) => f.depth === nf.depth);
          const item = {
            depth: nf.depth,
            ncsCompetency: nf.ncsCompetency,
            focus: nf.focus,
            question: nf.question,
            userAnswer: nIdx >= 0 ? nextFollowUps[nIdx].userAnswer : null,
            evaluation: nIdx >= 0 ? nextFollowUps[nIdx].evaluation : null,
          };
          if (nIdx >= 0) nextFollowUps[nIdx] = item;
          else nextFollowUps.push(item);
        }
      }

      nextFollowUps = nextFollowUps.sort((a, b) => a.depth - b.depth);

      const updatedThread =
        depth === 0
          ? {
              ...existingThread,
              initialAnswer: answerText,
              initialEvaluation: report,
              followUps: nextFollowUps,
            }
          : {
              ...existingThread,
              followUps: nextFollowUps,
            };

      onSessionUpdate({
        ...session,
        usedEvaluations: data.usedEvaluations,
        remainingEvaluations: data.remainingEvaluations,
        threads: {
          ...session.threads,
          [questionId]: updatedThread,
        },
        updatedAt: new Date().toISOString(),
      });
    } catch {
      setEvalError("네트워크 오류로 답변 채점을 완료하지 못했습니다. 횟수는 차감되지 않았습니다.");
    } finally {
      setSubmittingKey(null);
    }
  };

  if (!selectedQuestion) return null;

  const initKey = `${selectedQuestion.id}:0`;
  const initDraftVal = getDraft(initKey, activeThread?.initialAnswer);
  const initLen = initDraftVal.trim().length;

  const selfIntroKey = "self_intro:0";
  const selfIntroDraftVal = getDraft(
    selfIntroKey,
    session.threads["self_intro"]?.initialAnswer ?? session.selfIntroScript
  );
  const selfIntroLen = selfIntroDraftVal.trim().length;
  const selfIntroEstSec =
    selfIntroLen > 0 ? Math.max(1, Math.round(selfIntroLen / 5.2)) : 0;
  const selfIntroThread = session.threads["self_intro"];

  const freeAlreadyUsed =
    session.isFree &&
    session.usedEvaluations >= 1 &&
    !activeThread?.initialEvaluation;

  const renderCharCounter = (len: number): ReactNode => {
    const ok = len >= 100 && len <= 800;
    return (
      <span
        className={`text-xs font-bold ${
          ok ? "text-emerald-700" : len > 0 ? "text-amber-700" : "text-gray-400"
        }`}
      >
        {len} / 800자 {len > 0 && len < 100 ? "(최소 100자 필요)" : ok ? "· 입력 가능 ✓" : ""}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* 세션 상단 상태 바 */}
      <div className="bg-slate-900 text-white rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-md bg-emerald-500 text-white text-xs font-extrabold">
              {session.isFree ? "무료 체험 (2시간 보관)" : "실전 시뮬레이터 (7일 보관)"}
            </span>
            <span className="text-xs text-slate-300">
              직무: {session.jobCategory}
            </span>
            {session.jobContext && (
              <span className="px-2 py-0.5 rounded bg-blue-900/70 border border-blue-700 text-[11px] font-semibold text-blue-100">
                연동 공고: [{session.jobContext.instName}] {session.jobContext.title}
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm font-semibold text-slate-100">
            {session.isFree
              ? `예상 질문 ${session.questions.length}개 중 1문항 채점 · 1단계 꼬리질문 미리보기 제공`
              : `직무 10 + 공공기관 인성 5 = 총 ${session.questions.length}문항 · 채점할 때마다 7일 대비 노트 자동 저장됨`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-right">
            <p className="text-[10px] text-slate-400 font-semibold">
              잔여 채점·꼬리질문 한도
            </p>
            <p className="text-sm sm:text-base font-black text-emerald-400">
              {session.remainingEvaluations} / {session.maxEvaluations}회
            </p>
          </div>
          {lastDurationMs !== null && (
            <span className="text-[11px] text-slate-400">
              최근 채점 {(lastDurationMs / 1000).toFixed(1)}초
            </span>
          )}
        </div>
      </div>

      {/* 시뮬레이터 모드 전환 탭 (예상 질문 보드 vs 1분 자기소개 대본 모드) */}
      <div className="flex flex-wrap gap-2 bg-white p-2 rounded-2xl border border-gray-200 shadow-xs">
        <button
          type="button"
          onClick={() => {
            setSimulatorTab("questions");
            setEvalError("");
          }}
          className={`flex-1 min-w-[200px] py-2.5 px-4 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
            simulatorTab === "questions"
              ? "bg-blue-600 text-white shadow-xs"
              : "bg-gray-50 text-gray-700 hover:bg-gray-100"
          }`}
        >
          📋 예상 질문 · 꼬리질문 ({session.questions.length}문항)
        </button>
        <button
          type="button"
          onClick={() => {
            setSimulatorTab("self_intro");
            setEvalError("");
          }}
          className={`flex-1 min-w-[200px] py-2.5 px-4 rounded-xl text-xs sm:text-sm font-extrabold transition-all flex items-center justify-center gap-2 cursor-pointer ${
            simulatorTab === "self_intro"
              ? "bg-emerald-600 text-white shadow-xs"
              : "bg-gray-50 text-gray-700 hover:bg-gray-100"
          }`}
        >
          <span>🎤 1분 자기소개 대본 (생성·채점)</span>
          {selfIntroThread?.initialEvaluation ? (
            <span className="px-2 py-0.5 rounded-full bg-white/20 text-[11px]">
              {selfIntroThread.initialEvaluation.totalScore}점
            </span>
          ) : session.selfIntroScript ? (
            <span className="px-2 py-0.5 rounded-full bg-white/20 text-[11px]">
              대본 생성됨
            </span>
          ) : null}
        </button>
      </div>

      {simulatorTab === "self_intro" ? (
        <div className="space-y-5">
          <div className="bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-gray-100">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-md bg-emerald-600 text-white text-xs font-extrabold">
                    1분 자기소개 스튜디오
                  </span>
                  <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold">
                    권장 250~330자 · 약 50~60초 발화
                  </span>
                </div>
                <p className="text-xs text-gray-600">
                  자소서 핵심 경험(및 선택 공고)을 1분 구술 대본으로 자동 생성하거나 직접 입력해 발화 시간·일관성·꼬리질문을 점검하세요.
                </p>
              </div>

              {session.isFree ? (
                <button
                  type="button"
                  onClick={() => onUnlockClick?.()}
                  className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-xs border border-gray-300 cursor-pointer shrink-0"
                >
                  🔒 AI 대본 자동 생성 (유료 전용)
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isGeneratingSelfIntro}
                  onClick={handleGenerateSelfIntro}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-bold text-xs sm:text-sm cursor-pointer shrink-0 shadow-xs"
                >
                  {isGeneratingSelfIntro
                    ? "1분 대본 생성 중 (3~5초)..."
                    : session.selfIntroScript
                      ? "AI 1분 자기소개 대본 다시 생성 ↻"
                      : "AI 1분 자기소개 대본 자동 생성 ✨"}
                </button>
              )}
            </div>

            {session.selfIntroTips && session.selfIntroTips.length > 0 && (
              <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 text-xs text-emerald-950 space-y-1">
                <p className="font-extrabold text-emerald-800">
                  발표 호흡 · 강조 팁 ({session.selfIntroHook || "두괄식 1분 전달"})
                </p>
                <ul className="list-disc pl-4 space-y-0.5 text-emerald-900">
                  {session.selfIntroTips.map((tip, i) => (
                    <li key={i}>{tip}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="self-intro-textarea"
                  className="text-xs font-bold text-gray-800"
                >
                  내 1분 자기소개 대본 입력·수정 (80~600자)
                </label>
                <span
                  className={`text-xs font-bold ${
                    selfIntroLen >= 250 && selfIntroLen <= 330
                      ? "text-emerald-700"
                      : selfIntroLen >= 80
                        ? "text-blue-700"
                        : "text-gray-400"
                  }`}
                >
                  {selfIntroLen} / 600자 · 예상 발화 약 {selfIntroEstSec}초{" "}
                  {selfIntroLen >= 250 && selfIntroLen <= 330
                    ? "(1분 적정 ✓)"
                    : selfIntroLen > 330
                      ? "(약간 김 · 압축 권장)"
                      : selfIntroLen >= 80
                        ? "(보통)"
                        : ""}
                </span>
              </div>

              {freeAlreadyUsed ? (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs space-y-2">
                  <p className="font-bold text-amber-900">
                    무료 체험 채점 횟수(1회)를 이미 사용하셨습니다.
                  </p>
                  {onUnlockClick && (
                    <button
                      type="button"
                      onClick={onUnlockClick}
                      className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs cursor-pointer"
                    >
                      유료 이용권에서 대본 생성·무제한 연습하기
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <textarea
                    id="self-intro-textarea"
                    rows={6}
                    maxLength={600}
                    value={selfIntroDraftVal}
                    onChange={(e) => setDraft(selfIntroKey, e.target.value)}
                    placeholder="예: 안녕하십니까. 데이터 기반 행정 실무 역량을 갖춘 지원자입니다... (250~330자 내외가 실제 면접 1분에 가장 알맞습니다)"
                    className="w-full p-3.5 border border-gray-300 rounded-xl text-sm text-gray-800 leading-relaxed focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none resize-y"
                  />

                  {evalError && (
                    <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                      {evalError}
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={
                      submittingKey !== null ||
                      (!session.isFree && session.remainingEvaluations <= 0)
                    }
                    onClick={() =>
                      handleEvaluate(
                        "self_intro",
                        0,
                        selfIntroKey,
                        session.threads["self_intro"]?.initialAnswer ??
                          session.selfIntroScript
                      )
                    }
                    className="w-full py-3 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold text-sm transition-colors cursor-pointer"
                  >
                    {submittingKey === selfIntroKey
                      ? "1분 자기소개 대본 채점 및 꼬리질문 추출 중 (3~5초)..."
                      : selfIntroThread?.initialEvaluation
                        ? "대본 수정 후 다시 채점하기 (잔여 차감 1회)"
                        : "1분 자기소개 대본 채점 + 예상 꼬리질문 받기"}
                  </button>
                </>
              )}
            </div>

            {selfIntroThread?.initialEvaluation && (
              <EvaluationReportCard
                report={selfIntroThread.initialEvaluation}
                onUnlockClick={onUnlockClick}
              />
            )}
          </div>

          {/* 1분 자기소개 기반 동적 꼬리질문 연쇄 (동일 1~3단계 컴포넌트 재사용) */}
          {selfIntroThread?.followUps && selfIntroThread.followUps.length > 0 && (
            <div className="space-y-4">
              {selfIntroThread.followUps.map((f) => {
                const fKey = `self_intro:${f.depth}`;
                const fDraft = getDraft(fKey, f.userAnswer);
                const fLen = fDraft.trim().length;
                return (
                  <div
                    key={f.depth}
                    className="bg-white border-2 border-indigo-200 rounded-2xl p-5 space-y-3 shadow-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-md text-xs font-extrabold bg-indigo-100 text-indigo-800 border border-indigo-200">
                          자기소개 기반 꼬리질문 {f.depth} / 3단계
                        </span>
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold">
                          NCS {f.ncsCompetency}
                        </span>
                      </div>
                      <span className="text-[11px] text-gray-500">
                        검증 초점: {f.focus}
                      </span>
                    </div>
                    <p className="text-sm sm:text-base font-extrabold text-gray-900 leading-snug break-keep">
                      &ldquo;{f.question}&rdquo;
                    </p>
                    {!session.isFree && (
                      <div className="space-y-2 pt-2 border-t border-gray-100">
                        <div className="flex items-center justify-between">
                          <label
                            htmlFor={`self-intro-fu-${fKey}`}
                            className="text-xs font-bold text-gray-800"
                          >
                            {f.depth}단계 압박 꼬리질문 답변 (100~800자)
                          </label>
                          {renderCharCounter(fLen)}
                        </div>
                        <textarea
                          id={`self-intro-fu-${fKey}`}
                          rows={4}
                          maxLength={800}
                          value={fDraft}
                          onChange={(e) => setDraft(fKey, e.target.value)}
                          placeholder={`${f.depth}단계 꼬리질문에 100~800자로 방어 답변을 작성해 주세요.`}
                          className="w-full p-3 border border-gray-300 rounded-xl text-sm text-gray-800 leading-relaxed focus:ring-2 focus:ring-indigo-500 outline-none resize-y"
                        />
                        <button
                          type="button"
                          disabled={
                            submittingKey !== null ||
                            session.remainingEvaluations <= 0
                          }
                          onClick={() =>
                            handleEvaluate("self_intro", f.depth, fKey, f.userAnswer)
                          }
                          className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold text-xs sm:text-sm cursor-pointer"
                        >
                          {submittingKey === fKey
                            ? `${f.depth}단계 답변 채점 중...`
                            : `${f.depth}단계 채점 완료`}
                        </button>
                        {f.evaluation && (
                          <EvaluationReportCard
                            report={f.evaluation}
                            onUnlockClick={onUnlockClick}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
      /* 메인 2단 레이아웃: 좌측 문항 목록 / 우측 답변·채점·3단계 꼬리질문 */
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* 좌측 문항 보드 */}
        <aside className="lg:col-span-5 bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-gray-100">
            <h3 className="text-sm font-extrabold text-gray-900">
              예상 질문 리스트 (NCS 태그)
            </h3>
            <div className="flex gap-1">
              {[
                { key: "all" as const, label: `전체(${session.questions.length})` },
                { key: "job" as const, label: `직무(${jobCount})` },
                { key: "personality" as const, label: `인성(${personalityCount})` },
              ].map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setKindFilter(t.key)}
                  className={`px-2 py-1 rounded-md text-[11px] font-bold cursor-pointer ${
                    kindFilter === t.key
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 max-h-[540px] overflow-y-auto pr-1">
            {filteredQuestions.map((q) => {
              const thread = session.threads[q.id];
              const isSelected = q.id === selectedQuestion.id;
              const score = thread?.initialEvaluation?.totalScore;
              const answeredFollowUps = (thread?.followUps || []).filter(
                (f) => Boolean(f.userAnswer)
              ).length;

              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => {
                    setSelectedQuestionId(q.id);
                    setEvalError("");
                  }}
                  className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? "bg-blue-50 border-blue-500 shadow-xs"
                      : "bg-white border-gray-200 hover:border-blue-300"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-extrabold text-gray-900">
                        Q{q.number}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          q.kind === "personality"
                            ? "bg-purple-100 text-purple-800"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {q.kind === "personality" ? "공공기관 인성" : "직무 심층"}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold">
                        {q.ncsCompetency}
                      </span>
                    </div>

                    {typeof score === "number" && (
                      <span className="text-[11px] font-extrabold text-blue-700 bg-white px-2 py-0.5 rounded border border-blue-200">
                        {score}점
                        {answeredFollowUps > 0 ? ` · 꼬리 ${answeredFollowUps}단계` : ""}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-800 font-medium line-clamp-2 leading-relaxed">
                    {q.question}
                  </p>
                </button>
              );
            })}

            {session.isFree && (
              <div className="p-3.5 rounded-xl bg-gray-50 border border-dashed border-gray-300 text-xs space-y-2">
                <p className="font-bold text-gray-800">
                  🔒 나머지 12문항 잠금 (직무 8문항 + 공공기관 인성·청렴 4문항)
                </p>
                <p className="text-[11px] text-gray-500">
                  유료 이용권(4,900원) 결제 시 15문항 전체와 최대 45회 답변 채점, 1~3단계 꼬리질문 연쇄, 7일 면접 대비 노트가 열립니다.
                </p>
                {onUnlockClick && (
                  <button
                    type="button"
                    onClick={onUnlockClick}
                    className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs cursor-pointer"
                  >
                    4,900원으로 15문항 전체 열기 →
                  </button>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* 우측 답변 연습 · 채점 · 동적 3단계 꼬리질문 패널 */}
        <div className="lg:col-span-7 space-y-5">
          {/* 선택 문항 본문 */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-blue-600 text-white text-xs font-extrabold">
                  Q{selectedQuestion.number}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold">
                  NCS {selectedQuestion.ncsCompetency}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold">
                  {selectedQuestion.kind === "personality"
                    ? "공공기관 인성·조직적합성"
                    : "직무·경험 심층"}
                </span>
              </div>
            </div>

            <h4 className="text-base sm:text-lg font-extrabold text-gray-900 leading-snug break-keep">
              {selectedQuestion.question}
            </h4>
            <p className="text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-lg border border-gray-100">
              <strong className="text-gray-700">면접관 검증 의도:</strong>{" "}
              {selectedQuestion.intentSummary}
            </p>

            {/* 답변 입력 */}
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <label
                  htmlFor={`answer-input-${selectedQuestion.id}`}
                  className="text-xs font-bold text-gray-800"
                >
                  내 구술 답변 입력 (100~800자)
                </label>
                {renderCharCounter(initLen)}
              </div>

              {freeAlreadyUsed ? (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs space-y-2">
                  <p className="font-bold text-amber-900">
                    무료 체험 채점 횟수(1회)를 이미 사용하셨습니다.
                  </p>
                  <p className="text-amber-800">
                    나머지 질문 채점과 모범 답변 확인, 1~3단계 꼬리질문 연습은 4,900원 이용권에서 이용할 수 있습니다.
                  </p>
                  {onUnlockClick && (
                    <button
                      type="button"
                      onClick={onUnlockClick}
                      className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs cursor-pointer"
                    >
                      4,900원 이용권으로 계속 연습하기
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <textarea
                    id={`answer-input-${selectedQuestion.id}`}
                    rows={5}
                    maxLength={800}
                    value={initDraftVal}
                    onChange={(e) => setDraft(initKey, e.target.value)}
                    placeholder="실제 면접장에서 말하듯 결론을 먼저 말씀하시고 상황-행동(본인 역할)-결과 순으로 100~800자 내외로 작성해 주세요."
                    className="w-full p-3.5 border border-gray-300 rounded-xl text-sm text-gray-800 leading-relaxed focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-y"
                  />

                  {evalError && (
                    <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                      {evalError}
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={
                      submittingKey !== null ||
                      (!session.isFree && session.remainingEvaluations <= 0)
                    }
                    onClick={() =>
                      handleEvaluate(
                        selectedQuestion.id,
                        0,
                        initKey,
                        activeThread?.initialAnswer
                      )
                    }
                    className="w-full py-3 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold text-sm transition-colors cursor-pointer"
                  >
                    {submittingKey === initKey
                      ? "AI 면접관이 루브릭 채점 및 일관성 대조 중 (3~5초)..."
                      : activeThread?.initialEvaluation
                        ? "답변 수정 후 다시 채점하기 (잔여 차감 1회)"
                        : "답변 즉시 채점 및 꼬리질문 받기"}
                  </button>
                </>
              )}
            </div>

            {/* 1차 채점 결과 */}
            {activeThread?.initialEvaluation && (
              <EvaluationReportCard
                report={activeThread.initialEvaluation}
                onUnlockClick={onUnlockClick}
              />
            )}
          </div>

          {/* 동적 1~3단계 꼬리질문 연쇄 영역 */}
          {activeThread?.followUps && activeThread.followUps.length > 0 && (
            <div className="space-y-4">
              {activeThread.followUps.map((f) => {
                const fKey = `${selectedQuestion.id}:${f.depth}`;
                const fDraft = getDraft(fKey, f.userAnswer);
                const fLen = fDraft.trim().length;

                return (
                  <div
                    key={f.depth}
                    className="bg-white border-2 border-indigo-200 rounded-2xl p-5 space-y-3 shadow-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-2.5 py-0.5 rounded-md text-xs font-extrabold ${
                            f.depth === 3
                              ? "bg-red-100 text-red-800 border border-red-200"
                              : f.depth === 2
                                ? "bg-indigo-100 text-indigo-800 border border-indigo-200"
                                : "bg-blue-100 text-blue-800 border border-blue-200"
                          }`}
                        >
                          동적 꼬리질문 {f.depth} / 3단계
                        </span>
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold">
                          NCS {f.ncsCompetency}
                        </span>
                      </div>
                      <span className="text-[11px] text-gray-500">
                        검증 초점: {f.focus}
                      </span>
                    </div>

                    <p className="text-sm sm:text-base font-extrabold text-gray-900 leading-snug break-keep">
                      &ldquo;{f.question}&rdquo;
                    </p>

                    {session.isFree ? (
                      <div className="p-3.5 rounded-xl bg-gray-50 border border-dashed border-gray-300 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <span className="text-gray-700 font-semibold">
                          🔒 무료 체험에서는 1단계 꼬리질문 미리보기까지만 열람 가능합니다. (답변 채점 및 2~3단계 연쇄 압박은 유료 전용)
                        </span>
                        {onUnlockClick && (
                          <button
                            type="button"
                            onClick={onUnlockClick}
                            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shrink-0 cursor-pointer"
                          >
                            잠금해제
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2 pt-2 border-t border-gray-100">
                        <div className="flex items-center justify-between">
                          <label
                            htmlFor={`followup-input-${fKey}`}
                            className="text-xs font-bold text-gray-800"
                          >
                            {f.depth}단계 압박 꼬리질문 답변 (100~800자)
                          </label>
                          {renderCharCounter(fLen)}
                        </div>
                        <textarea
                          id={`followup-input-${fKey}`}
                          rows={4}
                          maxLength={800}
                          value={fDraft}
                          onChange={(e) => setDraft(fKey, e.target.value)}
                          placeholder={`${f.depth}단계 꼬리질문의 핵심 허점을 보완해 100~800자로 방어 답변을 작성해 주세요.`}
                          className="w-full p-3 border border-gray-300 rounded-xl text-sm text-gray-800 leading-relaxed focus:ring-2 focus:ring-indigo-500 outline-none resize-y"
                        />
                        <button
                          type="button"
                          disabled={
                            submittingKey !== null ||
                            session.remainingEvaluations <= 0
                          }
                          onClick={() =>
                            handleEvaluate(
                              selectedQuestion.id,
                              f.depth,
                              fKey,
                              f.userAnswer
                            )
                          }
                          className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold text-xs sm:text-sm cursor-pointer"
                        >
                          {submittingKey === fKey
                            ? `${f.depth}단계 답변 채점 중 (3~5초)...`
                            : f.depth < 3
                              ? `${f.depth}단계 채점 + 다음(${f.depth + 1}단계) 꼬리질문 생성`
                              : `최종 3단계 답변 채점 및 대비 노트 저장`}
                        </button>

                        {f.evaluation && (
                          <EvaluationReportCard
                            report={f.evaluation}
                            onUnlockClick={onUnlockClick}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
