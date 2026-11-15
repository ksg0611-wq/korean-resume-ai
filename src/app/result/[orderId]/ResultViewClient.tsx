"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import PaidResultShareCard from "@/components/PaidResultShareCard";
import PackageResultTabs from "@/components/PackageResultTabs";
import { INTERVIEW_MAX_EVALUATIONS } from "@/lib/policy";
import type {
  InterviewPrepNote,
  InterviewQuestionItem,
  ResumeQuestionItem,
} from "@/lib/results";

interface ResultViewClientProps {
  orderId: string;
  serviceType: "resume" | "interview";
  title: string;
  text: string;
  items?: ResumeQuestionItem[] | null;
  interviewQuestions?: InterviewQuestionItem[] | null;
  interviewPending?: boolean;
  interviewSessionId?: string | null;
  interviewNote?: InterviewPrepNote | null;
  remainingEvaluations?: number | null;
  maxEvaluations?: number | null;
  resultToken: string;
  createdAt: string;
  expiresAt: string;
  receiptUrl: string | null;
  remainingGenerations: number;
  resultUrl: string;
  kakaoChannelUrl: string | null;
}

export default function ResultViewClient({
  orderId,
  serviceType,
  title,
  text: initialText,
  items,
  interviewQuestions: initialInterviewQuestions,
  interviewPending: initialInterviewPending = false,
  interviewSessionId,
  interviewNote,
  remainingEvaluations,
  maxEvaluations,
  resultToken,
  createdAt,
  expiresAt,
  receiptUrl,
  remainingGenerations,
  resultUrl,
  kakaoChannelUrl,
}: ResultViewClientProps) {
  const router = useRouter();
  const [text, setText] = useState(initialText);
  const [interviewQuestions, setInterviewQuestions] = useState<
    InterviewQuestionItem[]
  >(initialInterviewQuestions || []);
  const [interviewPending, setInterviewPending] = useState(
    initialInterviewPending
  );
  const [isRetryingInterview, setIsRetryingInterview] = useState(false);
  const [retryError, setRetryError] = useState("");
  const [isRedirecting, setIsRedirecting] = useState(false);

  const handleRetryInterview = async () => {
    setIsRetryingInterview(true);
    setRetryError("");
    try {
      const res = await fetch("/api/interview/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, resultToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRetryError(
          data?.error ||
            "면접 질문 재생성에 실패했습니다. 잠시 후 다시 시도해 주세요."
        );
        return;
      }
      if (Array.isArray(data.interviewQuestions)) {
        setInterviewQuestions(data.interviewQuestions);
      }
      if (typeof data.text === "string" && data.text) {
        setText(data.text);
      }
      setInterviewPending(false);
    } catch {
      setRetryError(
        "네트워크 오류로 면접 질문 생성에 실패했습니다. 다시 시도해 주세요."
      );
    } finally {
      setIsRetryingInterview(false);
    }
  };

  const handleInterviewRedirect = async () => {
    setIsRedirecting(true);
    try {
      const res = await fetch("/api/interview/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText: text }),
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/interview?token=${data.token}`);
      } else {
        alert("면접 준비 페이지로 이동하는 데 실패했습니다.");
      }
    } catch {
      alert("오류가 발생했습니다.");
    } finally {
      setIsRedirecting(false);
    }
  };

  const hasStructuredItems = Array.isArray(items) && items.length > 0;
  const hasInterviewNote =
    serviceType === "interview" &&
    interviewNote &&
    Array.isArray(interviewNote.entries) &&
    interviewNote.entries.length > 0;

  const effectiveRemainingEval =
    remainingEvaluations ??
    interviewNote?.remainingEvaluations ??
    INTERVIEW_MAX_EVALUATIONS;
  const effectiveMaxEval =
    maxEvaluations ??
    interviewNote?.maxEvaluations ??
    INTERVIEW_MAX_EVALUATIONS;

  return (
    <main className="flex-1 bg-gray-50 py-8 sm:py-12 px-4 sm:px-6 lg:px-8 text-gray-900">
      <div className="max-w-3xl mx-auto bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-200">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-4 mb-5 border-b border-gray-100">
          <div>
            <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-md border border-blue-100">
              {serviceType === "interview"
                ? "공공기관 AI 면접 대비 노트"
                : "공고 지원 완성 패키지"}
            </span>
            <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 mt-2">
              {title}
            </h1>
            <p className="text-xs text-gray-500 mt-1">
              생성 시각:{" "}
              {new Intl.DateTimeFormat("ko-KR", {
                timeZone: "Asia/Seoul",
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(createdAt))}
            </p>
          </div>
          <Link
            href={serviceType === "interview" ? "/interview" : "/"}
            className="text-xs font-semibold text-gray-600 hover:text-blue-600 underline"
          >
            생성 화면으로 이동
          </Link>
        </div>

        <PaidResultShareCard
          orderId={orderId}
          serviceType={serviceType}
          resultText={text}
          resultUrl={resultUrl}
          expiresAt={expiresAt}
          receiptUrl={receiptUrl}
          remainingGenerations={
            serviceType === "interview" ? null : remainingGenerations
          }
          kakaoChannelUrl={kakaoChannelUrl}
        />

        {/* 면접 주문인 경우 상단에도 '이어서 모의면접 연습하기' CTA 제공 */}
        {serviceType === "interview" && interviewSessionId && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs sm:text-sm text-emerald-950 space-y-0.5">
              <p className="font-extrabold">
                7일 이내 재접속 시 기존 질문·답변·꼬리질문 세션이 그대로 복구됩니다
              </p>
              <p className="text-xs text-emerald-800">
                현재 답변 채점 잔여 횟수: <strong>{effectiveRemainingEval} / {effectiveMaxEval}회</strong>
              </p>
            </div>
            <Link
              href={`/interview?orderId=${encodeURIComponent(orderId)}&token=${encodeURIComponent(resultToken)}`}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm rounded-xl text-center shrink-0 transition-colors"
            >
              이어서 모의면접 연습하기 (잔여 채점 {effectiveRemainingEval}/{effectiveMaxEval}회) →
            </Link>
          </div>
        )}

        {retryError && (
          <div className="mb-4 p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
            {retryError}
          </div>
        )}

        {hasStructuredItems ? (
          <div className="mb-6">
            <PackageResultTabs
              items={items}
              interviewQuestions={interviewQuestions}
              interviewPending={interviewPending}
              isRetryingInterview={isRetryingInterview}
              onRetryInterview={handleRetryInterview}
            />
          </div>
        ) : hasInterviewNote && interviewNote ? (
          <div className="space-y-4 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-gray-50 px-4 py-3 rounded-xl border border-gray-200 text-xs">
              <span className="font-bold text-gray-800">
                총 {interviewNote.totalQuestions}문항 중 {interviewNote.answeredCount}문항 답변 완료
              </span>
              <span className="text-gray-600">
                채점 사용 {interviewNote.usedEvaluations} / {interviewNote.maxEvaluations}회
              </span>
            </div>

            {interviewNote.entries.map((entry) => (
              <div
                key={entry.questionId}
                className="bg-gray-50/70 border border-gray-200 rounded-xl p-4 sm:p-5 space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded bg-blue-600 text-white text-xs font-extrabold">
                      Q{entry.number}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold">
                      {entry.ncsCompetency}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-white border border-gray-200 text-gray-700 text-[11px] font-semibold">
                      {entry.kind === "personality" ? "공공기관 인성" : "직무 심층"}
                    </span>
                  </div>
                  {typeof entry.totalScore === "number" && (
                    <span className="text-xs font-extrabold text-blue-700">
                      {entry.totalScore}점 · {entry.consistencyLabel || "-"}
                    </span>
                  )}
                </div>

                <p className="text-sm font-bold text-gray-900 leading-snug">
                  {entry.question}
                </p>

                {entry.userAnswer ? (
                  <div className="space-y-2 text-xs text-gray-700 pt-2 border-t border-gray-200/80">
                    <p>
                      <strong className="text-gray-900">내 답변:</strong>{" "}
                      {entry.userAnswer}
                    </p>
                    {entry.consistencyReason && (
                      <p className="text-gray-600">
                        <strong className="text-gray-800">일관성 점검:</strong>{" "}
                        {entry.consistencyReason}
                      </p>
                    )}
                    {entry.modelAnswer && (
                      <p className="bg-white p-3 rounded-lg border border-emerald-200 text-gray-800">
                        <strong className="text-emerald-800">교정 모범 답변:</strong>{" "}
                        {entry.modelAnswer}
                      </p>
                    )}
                    {entry.followUps.length > 0 && (
                      <div className="space-y-1.5 pl-3 border-l-2 border-indigo-200">
                        {entry.followUps.map((f) => (
                          <div key={f.depth} className="space-y-0.5">
                            <p className="font-semibold text-indigo-900">
                              [꼬리질문 {f.depth}단계 · {f.ncsCompetency}] {f.question}
                            </p>
                            {f.userAnswer && (
                              <p className="text-gray-700">
                                ↳ 내 답변({f.totalScore ?? "-"}점): {f.userAnswer}
                              </p>
                            )}
                            {f.modelAnswer && (
                              <p className="text-emerald-800">
                                ↳ 교정 답변: {f.modelAnswer}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">
                    아직 답변 연습 전입니다. 상단 &apos;이어서 모의면접 연습하기&apos; 버튼에서 바로 연습할 수 있습니다.
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="whitespace-pre-wrap bg-gray-50 p-5 sm:p-6 rounded-xl border border-gray-200 text-sm sm:text-base leading-relaxed text-gray-800 select-text mb-6">
            {text}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          {serviceType === "resume" && (
            <button
              type="button"
              onClick={handleInterviewRedirect}
              disabled={isRedirecting}
              className="flex-1 min-w-[220px] py-3.5 px-5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-bold text-sm rounded-xl transition-colors cursor-pointer"
            >
              {isRedirecting
                ? "이동 중..."
                : "AI 모의면접 압박 꼬리질문 더 연습하기 →"}
            </button>
          )}
          {serviceType === "interview" && interviewSessionId ? (
            <Link
              href={`/interview?orderId=${encodeURIComponent(orderId)}&token=${encodeURIComponent(resultToken)}`}
              className="flex-1 min-w-[220px] py-3.5 px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl transition-colors text-center"
            >
              이어서 모의면접 연습하기 (잔여 채점 {effectiveRemainingEval}/{effectiveMaxEval}회) →
            </Link>
          ) : (
            <Link
              href={
                serviceType === "interview"
                  ? `/interview?orderId=${encodeURIComponent(orderId)}`
                  : `/?orderId=${encodeURIComponent(orderId)}`
              }
              className="py-3.5 px-5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-sm rounded-xl transition-colors text-center"
            >
              {remainingGenerations > 0
                ? `남은 횟수(${remainingGenerations}회)로 다시 생성하기`
                : "새로 작성하기"}
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
