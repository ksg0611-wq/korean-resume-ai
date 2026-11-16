import Link from "next/link";
import { PAID_GENERATIONS_BREAKDOWN, REFUND_SUMMARY_TEXT } from "@/lib/policy";

export default function PackageComparisonTable() {
  const rows = [
    {
      feature: "AI 자소서 문항 제공",
      free: "1번 문항(지원동기)만 공개\n(2~4번 문항 잠금)",
      paid: "표준 4문항 전체 완성본 (약 2,000자)\n지원동기 · 직무역량 · 협업 · 입사후포부",
    },
    {
      feature: "자소서 진단 및 교정",
      free: "점수 · 상위 약점 2건 · 예시 1개",
      paid: "전 문항 약점 해결 + 블라인드 치환 완성본",
    },
    {
      feature: "맞춤 면접 질문 10선",
      free: "미제공",
      paid: "내 자소서 기반 면접 질문 10선 + 답변 가이드",
    },
    {
      feature: "생성 횟수 · 재열람",
      free: "미리보기 최대 2시간 보관",
      paid: `${PAID_GENERATIONS_BREAKDOWN} · 7일 보관 링크 · TXT 저장`,
    },
    {
      feature: "시스템 오류 보호",
      free: "-",
      paid: REFUND_SUMMARY_TEXT,
    },
  ];

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50/70">
      <div className="px-4 py-3 bg-white border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs sm:text-sm font-extrabold text-gray-900">
            무료 체험 vs 공고 지원 완성 패키지 비교
          </h3>
          <p className="text-[11px] text-gray-500 mt-0.5">
            결제 시 {PAID_GENERATIONS_BREAKDOWN} 이용권이 발급되어 무료 미리보기 잠금해제 후에도 2회 추가 수정이 가능합니다.
          </p>
        </div>
        <Link
          href="/sample"
          className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap"
        >
          AI 생성 샘플 먼저 보기 ↗
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-100/70 text-gray-600">
              <th className="py-2.5 px-3.5 font-bold w-[26%]">항목</th>
              <th className="py-2.5 px-3.5 font-bold w-[34%]">무료 체험 (0원)</th>
              <th className="py-2.5 px-3.5 font-extrabold text-blue-700 bg-blue-50/70 w-[40%]">
                공고 지원 패키지 (4,900원)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200/80 bg-white">
            {rows.map((row) => (
              <tr key={row.feature}>
                <td className="py-2.5 px-3.5 font-bold text-gray-800 align-top">
                  {row.feature}
                </td>
                <td className="py-2.5 px-3.5 text-gray-500 whitespace-pre-line align-top leading-relaxed">
                  {row.free}
                </td>
                <td className="py-2.5 px-3.5 text-gray-900 font-semibold bg-blue-50/30 whitespace-pre-line align-top leading-relaxed">
                  {row.paid}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-2.5 bg-emerald-50/80 border-t border-emerald-100 text-[11px] text-emerald-900 font-medium break-keep">
        💡 결제 영역에서 <strong>&quot;면접 연습 추가 (+3,000원)&quot;</strong> 체크 시 <strong>7,900원 통합 패키지</strong>로 AI 모의면접 시뮬레이터(15문항·45회 채점·꼬리질문·7일 대비 노트)까지 함께 이용하실 수 있습니다.
      </div>
    </div>
  );
}
