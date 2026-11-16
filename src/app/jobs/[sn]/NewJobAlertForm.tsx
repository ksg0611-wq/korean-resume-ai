"use client";

import React, { useState } from "react";

interface NewJobAlertFormProps {
  sn: number;
  instName: string;
  jobTitle: string;
}

export default function NewJobAlertForm({
  sn,
  instName,
  jobTitle,
}: NewJobAlertFormProps) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = email.trim();
    if (!clean || !clean.includes("@")) {
      setError("올바른 이메일 주소를 입력해 주세요.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: clean,
          sn,
          instName,
          jobTitle,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message || "알림 신청 중 오류가 발생했습니다.");
      }

      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || "네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section
      aria-label="이 기관 새 공고 알림 받기"
      className="mt-6 bg-white rounded-2xl p-6 sm:p-8 border border-gray-200 shadow-sm space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700 text-[11px] font-bold mb-1.5">
            선택 항목 · 이메일 알림
          </span>
          <h2 className="text-base sm:text-lg font-extrabold text-gray-900">
            이 기관 새 공고 알림 받기
          </h2>
        </div>
      </div>

      <p className="text-xs sm:text-sm text-gray-600 leading-relaxed break-keep">
        <strong className="text-gray-900">{instName}</strong>의 다음 신규 채용공고가 등록되면 이메일로 바로 안내해 드립니다. (자소서 작성은 별도 신청 없이 위 &ldquo;AI 자소서 작성하기&rdquo; 버튼으로 즉시 이용 가능합니다.)
      </p>

      {submitted ? (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs sm:text-sm text-emerald-900 flex items-center gap-2.5">
          <svg
            className="w-5 h-5 text-emerald-600 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M5 13l4 4L19 7"
            />
          </svg>
          <div>
            <strong>{email.trim()}</strong> 주소로 <strong>{instName}</strong> 새 공고 알림이 등록되었습니다.
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2.5">
          <label htmlFor="new-job-alert-email" className="sr-only">
            새 공고 알림을 받을 이메일 주소
          </label>
          <input
            id="new-job-alert-email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError(null);
            }}
            placeholder="새 공고 알림을 받을 이메일 (선택: name@example.com)"
            className="flex-1 px-4 py-3 rounded-xl border border-gray-300 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-3 rounded-xl bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 text-white font-bold text-sm transition-colors cursor-pointer shrink-0"
          >
            {loading ? "등록 중..." : "새 공고 알림 받기"}
          </button>
        </form>
      )}

      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}

      <p className="text-[11px] text-gray-500 leading-relaxed break-keep">
        입력하신 이메일은 <strong>{instName}</strong> 신규 채용공고 오픈 알림 발송 목적으로만 사용되며, 알림 발송 목적 달성 시까지 보관됩니다.{" "}
        <a href="/privacy" className="text-blue-600 underline font-semibold">
          개인정보처리방침 보기
        </a>
      </p>
    </section>
  );
}
