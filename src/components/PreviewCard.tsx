export default function PreviewCard() {
  return (
    <div className="w-full max-w-4xl mx-auto my-8 bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-blue-100">
        <h3 className="text-center text-sm font-bold text-blue-800 tracking-wide">
          AI 교정 전/후 비교 미리보기
        </h3>
      </div>
      <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-gray-100">
        <div className="flex-1 p-6 bg-gray-50/50">
          <div className="flex items-center gap-2 mb-3">
            <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-md">교정 전</span>
            <span className="text-sm font-semibold text-gray-700">평범한 자소서 3줄</span>
          </div>
          <p className="text-sm text-gray-500 leading-relaxed italic">
            "저는 대학 시절 마케팅 동아리 기장을 맡아 열심히 활동했습니다. 축제 때 열심히 홍보해서 사람들을 많이 모았습니다. 그때 배운 소통 능력으로 회사에 기여하겠습니다."
          </p>
        </div>
        
        <div className="flex-none flex items-center justify-center p-4 bg-white md:bg-transparent -my-4 md:my-0 md:-mx-4 z-10">
          <div className="bg-blue-600 rounded-full p-2 text-white shadow-lg transform md:rotate-0 rotate-90">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </div>
        </div>

        <div className="flex-1 p-6 bg-blue-50/30">
          <div className="flex items-center gap-2 mb-3">
            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-md">교정 후</span>
            <span className="text-sm font-semibold text-gray-800">STAR 기법 완벽 교정 자소서</span>
          </div>
          <div className="space-y-2 text-sm text-gray-700 leading-relaxed">
            <p><strong>[Situation]</strong> 30명 규모의 마케팅 동아리 기장으로서, 대학 축제 기간 내 신규 부원 모집 목표를 달성해야 했습니다.</p>
            <p><strong>[Task & Action]</strong> 타겟 분석을 통해 오프라인 부스 홍보와 함께 인스타그램 스토리 릴레이 이벤트를 기획하여 온-오프라인 연계 마케팅을 전개했습니다.</p>
            <p><strong>[Result]</strong> 그 결과 전년 대비 150% 증가한 500명의 방문객을 유치하며 성황리에 행사를 마쳤고, 데이터 기반의 소통과 문제 해결 역량을 길렀습니다.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
