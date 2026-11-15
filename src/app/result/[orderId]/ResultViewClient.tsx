"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import PaidResultShareCard from "@/components/PaidResultShareCard";

interface ResultViewClientProps {
  orderId: string;
  serviceType: "resume" | "interview";
  title: string;
  text: string;
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
  text,
  createdAt,
  expiresAt,
  receiptUrl,
  remainingGenerations,
  resultUrl,
  kakaoChannelUrl,
}: ResultViewClientProps) {
  const router = useRouter();
  const [isRedirecting, setIsRedirecting] = useState(false);

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

  return (
    <main className="flex-1 bg-gray-50 py-8 sm:py-12 px-4 sm:px-6 lg:px-8 text-gray-900">
      <div className="max-w-3xl mx-auto bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-200">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-4 mb-5 border-b border-gray-100">
          <div>
            <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-md border border-blue-100">
              {serviceType === "interview" ? "면접 꼬리질문 결과" : "자기소개서 생성 결과"}
            </span>
            <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 mt-2">
              {title}
            </h1>
            <p className="text-xs text-gray-500 mt-1">
              생성 시각: {new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" }).format(new Date(createdAt))}
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

        <div className="whitespace-pre-wrap bg-gray-50 p-5 sm:p-6 rounded-xl border border-gray-200 text-sm sm:text-base leading-relaxed text-gray-800 select-text mb-6">
          {text}
        </div>

        <div className="flex flex-wrap gap-3">
          {serviceType === "resume" && (
            <button
              type="button"
              onClick={handleInterviewRedirect}
              disabled={isRedirecting}
              className="flex-1 min-w-[220px] py-3.5 px-5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-bold text-sm rounded-xl transition-colors cursor-pointer"
            >
              {isRedirecting ? "이동 중..." : "이 자소서로 AI 면접 꼬리질문 받아보기 →"}
            </button>
          )}
          <Link
            href={serviceType === "interview" ? `/interview?orderId=${encodeURIComponent(orderId)}` : `/?orderId=${encodeURIComponent(orderId)}`}
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
