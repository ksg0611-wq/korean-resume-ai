import type { FreeDiagnosticResponse } from "@/lib/diagnoseRubric";
import { PAID_GENERATIONS_BREAKDOWN } from "@/lib/policy";

interface DiagnosisReportViewProps {
  report: FreeDiagnosticResponse;
  onUpgradeClick: () => void;
}

function getGradeBadgeStyle(grade: string): string {
  if (grade === "S" || grade === "A") {
    return "bg-emerald-100 text-emerald-800 border-emerald-200";
  }
  if (grade === "B") {
    return "bg-blue-100 text-blue-800 border-blue-200";
  }
  if (grade === "C") {
    return "bg-amber-100 text-amber-800 border-amber-200";
  }
  return "bg-red-100 text-red-800 border-red-200";
}

export default function DiagnosisReportView({
  report,
  onUpgradeClick,
}: DiagnosisReportViewProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-8 space-y-6">
      {/* 상단 종합 점수 요약 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-gray-100">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
              AI + 규칙 기반 정밀 진단 리포트
            </span>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-extrabold border ${getGradeBadgeStyle(
                report.grade
              )}`}
            >
              {report.grade}등급
            </span>
          </div>
          <h3 className="text-xl sm:text-2xl font-extrabold text-gray-900">
            자소서 완성도 진단{" "}
            <span className="text-blue-600">{report.totalScore}점</span>{" "}
            <span className="text-sm font-medium text-gray-400">/ 100점</span>
          </h3>
          <p className="text-xs sm:text-sm text-gray-600 leading-relaxed break-keep">
            {report.summary}
          </p>
        </div>

        <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 bg-gray-50 px-4 py-3 rounded-xl border border-gray-200 shrink-0">
          <div className="text-right">
            <p className="text-[11px] text-gray-500 font-semibold">측정 분량</p>
            <p className="text-sm font-extrabold text-gray-900">
              {report.metrics.charCount.toLocaleString()}자 /{" "}
              {report.metrics.byteCount2B.toLocaleString()} Byte
            </p>
          </div>
          <p className="text-[11px] text-gray-500">
            목표 {report.metrics.targetChars.toLocaleString()}자 기준{" "}
            {Math.round(report.metrics.fillRatio * 100)}% · 정량 수치{" "}
            <strong className="text-gray-800">{report.metrics.metricCount}건</strong>
          </p>
        </div>
      </div>

      {/* 5대 항목별 점수 게이지 */}
      <div className="space-y-3">
        <h4 className="text-sm font-bold text-gray-900">5대 항목별 세부 점수</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {report.categories.map((cat) => {
            const pct = Math.min(100, Math.round((cat.score / cat.maxScore) * 100));
            const barColor =
              pct >= 80
                ? "bg-emerald-500"
                : pct >= 55
                  ? "bg-blue-500"
                  : "bg-amber-500";
            return (
              <div
                key={cat.key}
                className="p-3.5 rounded-xl border border-gray-200 bg-gray-50/70 space-y-2"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-gray-800">{cat.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-white border border-gray-200 text-gray-600">
                      {cat.label}
                    </span>
                    <span className="font-extrabold text-gray-900">
                      {cat.score} / {cat.maxScore}
                    </span>
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div
                    className={`${barColor} h-2 rounded-full transition-all`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 블라인드 위반 요약 (총 건수만 공개, 상세 단어·위치는 잠금) */}
      <div
        className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          report.blindSummary.clean
            ? "bg-emerald-50/70 border-emerald-200 text-emerald-900"
            : "bg-red-50 border-red-200 text-red-900"
        }`}
      >
        <div className="space-y-0.5 text-xs sm:text-sm">
          <p className="font-bold flex items-center gap-1.5">
            <span>{report.blindSummary.clean ? "✓" : "⚠"}</span>
            <span>
              블라인드 규정 점검:{" "}
              {report.blindSummary.clean
                ? "위반 의심 키워드 0건"
                : `위반 의심 표현 ${report.blindSummary.totalViolations}건 발견`}
            </span>
          </p>
          <p className="text-xs opacity-85">
            {report.blindSummary.clean
              ? "주요 학교명·출신지·가족 관련 금칙어가 탐지되지 않았습니다."
              : "구체적인 위반 단어 위치와 블라인드 준수 교정본은 유료 완성본에서 자동 치환해 제공합니다."}
          </p>
        </div>
        <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-white/80 border border-current/20 shrink-0 self-start sm:self-center">
          🔒 상세 위치 잠금
        </span>
      </div>

      {/* 발견된 약점 (상위 2건 전체 공개 + 3번째 이후 잠금) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-gray-900">
            발견된 감점 요인 총 {report.totalWeaknessCount}건
          </h4>
          <span className="text-xs text-gray-500">
            상위 2건 무료 공개 · 나머지 {report.lockedWeaknesses.length}건 잠금
          </span>
        </div>

        <div className="space-y-2.5">
          {report.topWeaknesses.map((w, idx) => (
            <div
              key={w.id || idx}
              className="p-4 rounded-xl border border-amber-200 bg-amber-50/40 space-y-1.5"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] font-extrabold px-2 py-0.5 rounded uppercase ${
                    w.severity === "high"
                      ? "bg-red-100 text-red-700"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {w.severity === "high" ? "치명 약점" : "개선 권장"}
                </span>
                <p className="text-sm font-bold text-gray-900">{w.title}</p>
              </div>
              <p className="text-xs sm:text-sm text-gray-700 leading-relaxed break-keep">
                {w.description}
              </p>
            </div>
          ))}

          {report.lockedWeaknesses.map((lw) => (
            <div
              key={lw.id}
              className="p-4 rounded-xl border border-dashed border-gray-300 bg-gray-50 flex items-center justify-between gap-3"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-gray-200 text-gray-700">
                    {lw.severity === "high" ? "치명 약점" : "추가 약점"}
                  </span>
                  <p className="text-sm font-bold text-gray-800">{lw.title}</p>
                </div>
                <p className="text-xs text-gray-400 select-none">
                  🔒 상세 원인 분석 및 문장 재구성 가이드는 완성본에서 확인하실 수 있습니다.
                </p>
              </div>
              <span className="text-xs font-bold text-gray-500 bg-white px-2.5 py-1 rounded-lg border border-gray-200 shrink-0">
                잠금됨
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 수정 예시 문장 1개 공개 */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-gray-900">
            핵심 1문장 무료 교정 예시: {report.sampleFix.title}
          </h4>
          <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
            1문장 공개
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm">
          <div className="p-3.5 rounded-xl bg-red-50/60 border border-red-200 space-y-1">
            <span className="text-[11px] font-extrabold text-red-600">
              Before (원문 발췌)
            </span>
            <p className="text-gray-700 leading-relaxed break-keep">
              {report.sampleFix.beforeExcerpt}
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-1">
            <span className="text-[11px] font-extrabold text-emerald-700">
              After (STAR 구조 교정안)
            </span>
            <p className="text-gray-900 font-medium leading-relaxed break-keep">
              {report.sampleFix.afterExample}
            </p>
          </div>
        </div>
        <p className="text-xs text-gray-600 bg-gray-50 px-3.5 py-2 rounded-lg border border-gray-200">
          <strong>교정 포인트:</strong> {report.sampleFix.tip}
        </p>
      </div>

      {/* 유료 완성본 전환 CTA */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm sm:text-base font-extrabold">
            위 {report.totalWeaknessCount}가지 약점을 모두 고친 4문항 완성본 + 면접 질문 10선 받기
          </p>
          <p className="text-xs text-blue-100">
            원문 사실관계는 그대로 유지하고 블라인드·STAR·구체성을 한 번에 교정해 드립니다 ({PAID_GENERATIONS_BREAKDOWN}).
          </p>
        </div>
        <button
          type="button"
          onClick={onUpgradeClick}
          className="px-5 py-3 bg-white text-blue-700 hover:bg-blue-50 font-extrabold text-sm rounded-xl shadow-sm transition-colors cursor-pointer shrink-0"
        >
          약점을 고친 완성본 받기 — 4,900원 →
        </button>
      </div>
    </div>
  );
}
