"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import PaidResultShareCard from "@/components/PaidResultShareCard";
import PackageResultTabs from "@/components/PackageResultTabs";
import type { InterviewQuestionItem, ResumeQuestionItem } from "@/lib/results";

interface ResultViewClientProps {
  orderId: string;
  serviceType: "resume" | "interview";
  title: string;
  text: string;
  items?: ResumeQuestionItem[] | null;
  interviewQuestions?: InterviewQuestionItem[] | null;
  interviewPending?: boolean;
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
  const [interviewQuestions, setInterviewQuestions] = useState<InterviewQuestionItem[]>(
    initialInterviewQuestions || []
  );
  const [interviewPending, setInterviewPending] = useState(initialInterviewPending);
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
          data?.error || "면접 질문 재생성에 실패했습니다. 잠시 후 다시 시도해 주세요."
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
      setRetryError("네트워크 오류로 면접 질문 생성에 실패했습니다. 다시 시도해 주세요.");
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

  return (
    <main className="flex-1 bg-gray-50 py-8 sm:py-12 px-4 sm:px-6 lg:px-8 text-gray-900">
      <div className="max-w-3xl mx-auto bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-200">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-4 mb-5 border-b border-gray-100">
          <div>
            <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-md border border-blue-100">
              {serviceType === "interview" ? "면접 꼬리질문 결과" : "공고 지원 완성 패키지"}
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
          remainingGenerations={remainingGenerations}
          kakaoChannelUrl={kakaoChannelUrl}
        />

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
              {isRedirecting ? "이동 중..." : "AI 모의면접 압박 꼬리질문 더 연습하기 →"}
            </button>
          )}
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
        </div>
      </div>
    </main>
  );
}
