import type { Metadata } from "next";
import Link from "next/link";
import PackageResultTabs from "@/components/PackageResultTabs";
import {
  SAMPLE_DIAGNOSIS_SUMMARY,
  SAMPLE_DISCLAIMER,
  SAMPLE_FULL_WEAKNESSES,
  SAMPLE_INTERVIEW_QUESTIONS,
  SAMPLE_POSTING_INFO,
  SAMPLE_RAW_INPUT,
  SAMPLE_RESUME_ITEMS,
} from "@/lib/sampleData";

export const metadata: Metadata = {
  title: "AI 자소서 진단·4문항 완성본·면접 10선 샘플 | Korea Resume AI",
  description:
    "공공기관 일반행정(경영·회계·사무) 기준 가상 지원자 샘플을 통해 AI 자소서 점수 진단 리포트, 표준 4문항 완성본, 맞춤 면접 질문 10선 품질을 미리 확인하세요.",
  alternates: { canonical: "/sample" },
};

export default function SamplePage() {
  const report = SAMPLE_DIAGNOSIS_SUMMARY;

  return (
    <main className="flex-1 bg-gray-50 text-gray-900 py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* 상단 헤더 & 면책 고지 */}
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-8 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                실제 출력 결과 전체 샘플
              </span>
              <span className="text-xs font-extrabold px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200">
                {SAMPLE_POSTING_INFO.dDayBadge} 마감 예시
              </span>
            </div>
            <Link
              href="/jobs"
              className="text-xs font-bold text-blue-600 hover:text-blue-800 underline"
            >
              실시간 공공기관 공고 보러가기 ↗
            </Link>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
            {SAMPLE_POSTING_INFO.title}
          </h1>
          <p className="text-xs sm:text-sm text-gray-600">
            직무 분류(NCS): <strong>{SAMPLE_POSTING_INFO.ncsCategory}</strong> · 고용 형태:{" "}
            <strong>{SAMPLE_POSTING_INFO.employmentType}</strong>
          </p>

          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed break-keep">
            <strong>※ 안내:</strong> {SAMPLE_DISCLAIMER}
          </div>
        </section>

        {/* STEP 1: 가상 지원자 초안 원문 */}
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-8 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base sm:text-lg font-extrabold text-gray-900">
              1. 지원자가 입력한 개선 전 초안 (가상 원문)
            </h2>
            <span className="text-xs font-semibold text-gray-500">
              {SAMPLE_RAW_INPUT.length}자 입력
            </span>
          </div>
          <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 text-xs sm:text-sm text-gray-700 leading-relaxed break-keep">
            {SAMPLE_RAW_INPUT}
          </div>
        </section>

        {/* STEP 2: 진단 리포트 전체 예시 */}
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-8 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-100">
            <div>
              <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-md border border-indigo-200">
                2. AI + 규칙 기반 진단 리포트 예시
              </span>
              <h2 className="text-xl font-extrabold text-gray-900 mt-1.5">
                개선 전 종합 점수 <span className="text-blue-600">{report.totalScore}점</span> ({report.grade}등급)
              </h2>
              <p className="text-xs sm:text-sm text-gray-600 mt-1 break-keep">
                {report.summary}
              </p>
            </div>
            <div className="bg-gray-50 px-4 py-2.5 rounded-xl border border-gray-200 text-xs text-right shrink-0">
              <p className="font-bold text-gray-800">블라인드 위반 의심 1건</p>
              <p className="text-gray-500">정량 수치 토큰 0건 탐지</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {report.categories.map((cat) => (
              <div
                key={cat.key}
                className="p-3 rounded-xl border border-gray-200 bg-gray-50/70 space-y-1.5 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-gray-800">{cat.name}</span>
                  <span className="font-extrabold text-blue-700">
                    {cat.score}/{cat.maxScore} ({cat.label})
                  </span>
                </div>
                <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-blue-600 h-1.5 rounded-full"
                    style={{ width: `${Math.round((cat.score / cat.maxScore) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2.5">
            <h3 className="text-sm font-bold text-gray-900">
              발견된 감점 약점 전체 4건 (샘플 페이지에서는 4건 모두 공개)
            </h3>
            {SAMPLE_FULL_WEAKNESSES.map((w, idx) => (
              <div
                key={w.id}
                className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/40 text-xs sm:text-sm space-y-1"
              >
                <p className="font-bold text-gray-900">
                  [{idx < 2 ? "무료 공개 범위" : "유료 완성본 교정 반영"}] {w.title}
                </p>
                <p className="text-gray-700 leading-relaxed break-keep">{w.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* STEP 3: 유료 패키지 완성 결과 (4문항 완성본 + 10개 면접 질문 전체 공개) */}
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-8 space-y-4">
          <div className="space-y-1 pb-3 border-b border-gray-100">
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200">
              3. 공고 지원 완성 패키지 (4,900원) 전체 결과물 예시
            </span>
            <h2 className="text-xl font-extrabold text-gray-900 pt-1">
              약점 해결 4문항 완성본 + 내 경험 기반 면접 질문 10선
            </h2>
            <p className="text-xs text-gray-500">
              아래 탭을 전환해 4개 문항 완성본과 10개 면접 예상 질문 · 답변 가이드를 모두 확인하실 수 있습니다.
            </p>
          </div>

          <PackageResultTabs
            items={SAMPLE_RESUME_ITEMS}
            interviewQuestions={SAMPLE_INTERVIEW_QUESTIONS}
          />
        </section>

        {/* 하단 CTA */}
        <section className="rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-md">
          <div className="space-y-1 text-center sm:text-left">
            <h2 className="text-lg sm:text-xl font-extrabold">
              내 자소서로 직접 무료 진단받고 완성본까지 받아보세요
            </h2>
            <p className="text-xs sm:text-sm text-blue-100">
              하루 2회 무료 진단 / 1번 문항 미리보기 후 만족하시면 4,900원 단건 결제로 전체 패키지를 이용하실 수 있습니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5 shrink-0">
            <Link
              href="/"
              className="px-5 py-3 bg-white text-blue-700 hover:bg-blue-50 font-extrabold text-sm rounded-xl transition-colors"
            >
              내 자소서 무료 진단하기 →
            </Link>
            <Link
              href="/?mode=draft"
              className="px-5 py-3 bg-blue-500/40 hover:bg-blue-500/60 border border-white/30 text-white font-bold text-sm rounded-xl transition-colors"
            >
              메모로 1문항 무료 미리보기
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
