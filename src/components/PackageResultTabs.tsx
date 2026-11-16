"use client";

import { useState } from "react";
import type {
  InterviewQuestionItem,
  LockedResumeQuestionItem,
  ResumeQuestionItem,
} from "@/lib/results";

interface PackageResultTabsProps {
  items: ResumeQuestionItem[];
  lockedItems?: LockedResumeQuestionItem[];
  interviewQuestions?: InterviewQuestionItem[];
  interviewPending?: boolean;
  isRetryingInterview?: boolean;
  onRetryInterview?: () => void;
  onUnlockClick?: () => void;
  paymentLocked?: boolean;
  previewExpiresAt?: string | null;
}

export default function PackageResultTabs({
  items,
  lockedItems = [],
  interviewQuestions = [],
  interviewPending = false,
  isRetryingInterview = false,
  onRetryInterview,
  onUnlockClick,
  paymentLocked = false,
  previewExpiresAt,
}: PackageResultTabsProps) {
  const [activeTab, setActiveTab] = useState<"resume" | "interview">("resume");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const isPreviewMode = lockedItems.length > 0;
  const hasPlaceholderNotice = items.some((i) =>
    i.body.includes("[본인 수치 입력]")
  );

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopiedId(key);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-4">
      {/* 탭 헤더 */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab("resume")}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-colors cursor-pointer ${
            activeTab === "resume"
              ? "bg-blue-600 text-white shadow-xs"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          자소서 {isPreviewMode ? `미리보기 (1/${items.length + lockedItems.length}문항)` : `${items.length}문항 완성본`}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("interview")}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === "interview"
              ? "bg-blue-600 text-white shadow-xs"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          <span>예상 면접 질문 10선</span>
          {isPreviewMode && (
            <span className="text-[10px] bg-black/10 px-1.5 py-0.5 rounded">
              🔒 결제 후 열람
            </span>
          )}
          {!isPreviewMode && interviewPending && (
            <span className="text-[10px] bg-amber-400 text-amber-950 px-1.5 py-0.5 rounded font-extrabold">
              재시도 가능
            </span>
          )}
        </button>
      </div>

      {/* 부분 실패 (면접 질문 재시도) 상단 배너 */}
      {!isPreviewMode && interviewPending && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs sm:text-sm space-y-0.5">
            <p className="font-bold">
              자소서 {items.length}문항은 정상 저장되었으나 면접 질문 10선 생성이 일시 지연되었습니다.
            </p>
            <p className="text-xs text-amber-800">
              잔여 생성 횟수 차감 없이 지금 바로 면접 질문 10선만 무료로 다시 생성할 수 있습니다.
            </p>
          </div>
          {onRetryInterview && (
            <button
              type="button"
              onClick={onRetryInterview}
              disabled={isRetryingInterview}
              className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white font-bold text-xs sm:text-sm rounded-xl transition-colors cursor-pointer shrink-0"
            >
              {isRetryingInterview
                ? "면접 질문 생성 중..."
                : "면접 질문 10선 무료 다시 생성 →"}
            </button>
          )}
        </div>
      )}

      {/* 환각 방지 플레이스홀더 안내 */}
      {activeTab === "resume" && hasPlaceholderNotice && (
        <div className="px-3.5 py-2.5 rounded-xl bg-sky-50 border border-sky-200 text-xs text-sky-900">
          💡 입력 메모에 정확한 수치가 없어 임의 창작 대신{" "}
          <strong className="font-mono bg-white px-1 py-0.5 rounded border border-sky-200">
            [본인 수치 입력]
          </strong>
          으로 표기했습니다. 실제 경험 숫자를 채워 넣으면 설득력이 극대화됩니다.
        </div>
      )}

      {/* 자소서 문항 탭 */}
      {activeTab === "resume" && (
        <div className="space-y-4">
          {items.map((item) => (
            <article
              key={item.id}
              className="rounded-xl border border-gray-200 bg-gray-50/70 p-4 sm:p-5 space-y-2.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-gray-200/80">
                <h3 className="text-sm sm:text-base font-extrabold text-gray-900">
                  {item.title}
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-gray-600 bg-white px-2.5 py-1 rounded-lg border border-gray-200">
                    공백포함 {item.charCount}자 · {item.byteCount} Byte
                  </span>
                  <button
                    type="button"
                    onClick={() => copyText(item.id, item.body)}
                    className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 cursor-pointer"
                  >
                    {copiedId === item.id ? "복사됨 ✓" : "문항 복사"}
                  </button>
                </div>
              </div>
              <p className="text-sm sm:text-[15px] text-gray-800 leading-relaxed whitespace-pre-wrap select-text break-keep">
                {item.body}
              </p>
            </article>
          ))}

          {/* 미결제 미리보기: 2~4번 문항 서버 잠금 카드 */}
          {lockedItems.map((locked) => (
            <div
              key={locked.id}
              className="rounded-xl border border-dashed border-blue-200 bg-white p-4 sm:p-5 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm sm:text-base font-extrabold text-gray-800 flex items-center gap-2">
                  <span>🔒</span>
                  <span>{locked.title}</span>
                </h3>
                <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                  생성 완료 ({locked.charCount}자 / {locked.byteCount} Byte · 잠금됨)
                </span>
              </div>
              <div className="space-y-2 select-none" aria-hidden="true">
                <div className="h-3.5 bg-gray-200/80 rounded w-full blur-[2px]" />
                <div className="h-3.5 bg-gray-200/80 rounded w-[92%] blur-[2px]" />
                <div className="h-3.5 bg-gray-200/80 rounded w-[85%] blur-[2px]" />
              </div>
            </div>
          ))}

          {isPreviewMode && (paymentLocked || onUnlockClick) && (
            <div className="p-5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-sm sm:text-base font-extrabold">
                  2~4번 문항({lockedItems.reduce((sum, i) => sum + i.charCount, 0).toLocaleString()}자) + 맞춤 면접 질문 10선 바로 열기
                </p>
                <p className="text-xs text-blue-100">
                  현재 미리보기는 결제 후 즉시 잠금해제할 수 있도록 최대 2시간 동안 안전 보관됩니다
                  {previewExpiresAt ? " (보관 중)." : "."}
                </p>
              </div>
              {paymentLocked ? (
                <div className="px-5 py-3 bg-white/95 text-slate-800 font-extrabold text-sm rounded-xl shadow-sm shrink-0">
                  결제 서비스 준비 중입니다
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onUnlockClick}
                  className="px-5 py-3 bg-white text-blue-700 hover:bg-blue-50 font-extrabold text-sm rounded-xl shadow-sm transition-colors cursor-pointer shrink-0"
                >
                  4,900원으로 전체 잠금해제 →
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* 예상 면접 질문 10선 탭 */}
      {activeTab === "interview" && (
        <div className="space-y-3">
          {isPreviewMode ? (
            <div className="p-6 rounded-xl border border-dashed border-blue-200 bg-blue-50/40 text-center space-y-3">
              <p className="text-base font-extrabold text-gray-900">
                🔒 내 자소서 4문항 기반 예상 면접 질문 10선
              </p>
              <p className="text-xs sm:text-sm text-gray-600 max-w-lg mx-auto leading-relaxed break-keep">
                결제 완료 즉시 위에서 생성된 4개 문항의 경험 진위, 압박 꼬리질문, 공직윤리/직무 상황 판단 질문 10개와 답변 가이드가 함께 잠금 해제됩니다.
              </p>
              {paymentLocked ? (
                <span className="inline-block px-5 py-2.5 bg-slate-100 text-slate-700 border border-slate-200 font-bold text-sm rounded-xl">
                  결제 서비스 준비 중입니다
                </span>
              ) : (
                onUnlockClick && (
                  <button
                    type="button"
                    onClick={onUnlockClick}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl cursor-pointer transition-colors"
                  >
                    4,900원 결제하고 면접 10선 함께 받기 →
                  </button>
                )
              )}
            </div>
          ) : interviewQuestions.length === 0 ? (
            <div className="p-6 rounded-xl border border-gray-200 bg-gray-50 text-center space-y-3">
              <p className="text-sm font-bold text-gray-800">
                아직 면접 질문 목록이 생성되지 않았습니다.
              </p>
              {onRetryInterview && (
                <button
                  type="button"
                  onClick={onRetryInterview}
                  disabled={isRetryingInterview}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold text-sm rounded-xl cursor-pointer"
                >
                  {isRetryingInterview
                    ? "생성 중..."
                    : "면접 질문 10선 무료 다시 생성하기 →"}
                </button>
              )}
            </div>
          ) : (
            interviewQuestions.map((q) => (
              <div
                key={q.number}
                className="p-4 sm:p-5 rounded-xl border border-gray-200 bg-gray-50/70 space-y-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-extrabold text-white bg-blue-600 px-2 py-0.5 rounded">
                    Q{q.number}
                  </span>
                  <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                    {q.category}
                  </span>
                </div>
                <p className="text-sm sm:text-base font-extrabold text-gray-900 leading-snug break-keep">
                  {q.question}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 text-xs">
                  <div className="p-2.5 rounded-lg bg-white border border-gray-200">
                    <span className="font-bold text-gray-500 block mb-0.5">
                      🎯 출제 의도
                    </span>
                    <p className="text-gray-700 leading-relaxed break-keep">
                      {q.intent}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-emerald-50/70 border border-emerald-200">
                    <span className="font-bold text-emerald-700 block mb-0.5">
                      💡 답변 구조 팁
                    </span>
                    <p className="text-gray-800 leading-relaxed break-keep">
                      {q.answerTip}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
