"use client";

import { useState } from "react";

const TABS = [
  { key: "IT", label: "IT/개발" },
  { key: "기획", label: "기획" },
  { key: "마케팅", label: "마케팅" },
  { key: "기타", label: "기타" },
] as const;

type TabKey = typeof TABS[number]["key"];

const EXAMPLES: Record<TabKey, { before: string; after: { label: string; content: string }[] }> = {
  "IT": {
    before: "저는 웹 개발 프로젝트에 참여하여 프론트엔드 기능을 구현했습니다. 팀원들과 협업하며 좋은 결과를 만들었습니다.",
    after: [
      { label: "Situation", content: "5인 규모 팀 프로젝트에서 사용자 이탈률 30%가 발견된 결제 페이지 개선 과제를 맡음" },
      { label: "Task & Action", content: "React 상태관리 구조를 재설계하고 API 응답 지연 구간을 캐싱 로직으로 개선, 2주간 A/B 테스트 진행" },
      { label: "Result", content: "결제 완료율 18% 상승, 페이지 로딩 시간 1.2초 단축" },
    ]
  },
  "기획": {
    before: "신규 서비스 기획 업무를 담당했습니다. 시장 조사와 기획서 작성을 통해 프로젝트를 진행했습니다.",
    after: [
      { label: "Situation", content: "경쟁사 대비 신규 가입 전환율이 40% 낮은 온보딩 플로우 개선 필요성 발견" },
      { label: "Task & Action", content: "사용자 인터뷰 12건과 퍼널 데이터 분석을 통해 3단계였던 가입 절차를 1단계로 재설계, 개발팀과 2주간 스프린트 진행" },
      { label: "Result", content: "가입 전환율 22%p 상승, 이탈 지점 데이터 기반 추가 개선 로드맵 수립" },
    ]
  },
  "마케팅": {
    before: "SNS 마케팅 캠페인을 기획하고 운영했습니다. 콘텐츠 제작과 타겟팅을 통해 성과를 냈습니다.",
    after: [
      { label: "Situation", content: "신제품 런칭 직후 초기 3주간 인지도 확보가 시급한 상황" },
      { label: "Task & Action", content: "인스타그램/틱톡 타겟 오디언스를 3개 세그먼트로 분리해 크리에이티브 A/B 테스트, 예산 배분을 데이터 기반으로 주 단위 재조정" },
      { label: "Result", content: "CTR 2.3배 개선, 캠페인 ROAS 340% 달성" },
    ]
  },
  "기타": {
    before: "고객 응대 업무를 담당하며 문제를 해결했습니다. 성실하게 근무했습니다.",
    after: [
      { label: "Situation", content: "고객 컴플레인 처리 평균 소요시간이 팀 목표치를 초과하는 상황" },
      { label: "Task & Action", content: "반복되는 문의 유형 10건을 분류해 대응 매뉴얼을 직접 제작하고 팀 내 공유, 처리 프로세스 표준화 제안" },
      { label: "Result", content: "평균 응대 시간 35% 단축, 고객 만족도 점수 4.6점(5점 만점) 달성" },
    ]
  },
};

export default function PreviewCard() {
  const [activeTab, setActiveTab] = useState<TabKey>("IT");
  const [isVisible, setIsVisible] = useState(true);

  const handleTabChange = (tab: TabKey) => {
    if (tab === activeTab) return;
    setIsVisible(false);
    setTimeout(() => {
      setActiveTab(tab);
      setIsVisible(true);
    }, 150);
  };

  const example = EXAMPLES[activeTab];

  return (
    <div className="w-full max-w-4xl mx-auto my-8 bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-blue-100">
        <h3 className="text-center text-sm font-bold text-blue-800 tracking-wide mb-3">
          AI 교정 전/후 비교 미리보기
        </h3>
        {/* Tabs */}
        <div className="flex overflow-x-auto gap-2 justify-center flex-wrap">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`
                flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 focus:outline-none
                ${activeTab === tab.key
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-white text-gray-500 border border-gray-200 hover:border-blue-300 hover:text-blue-600"
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content with fade transition */}
      <div
        className="transition-opacity duration-150"
        style={{ opacity: isVisible ? 1 : 0 }}
      >
        <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-gray-100">
          {/* Before */}
          <div className="flex-1 p-6 bg-gray-50/50">
            <div className="flex items-center gap-2 mb-3">
              <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-md">교정 전</span>
              <span className="text-sm font-semibold text-gray-700">평범한 자소서</span>
            </div>
            <p className="text-sm text-gray-500 leading-relaxed italic">
              "{example.before}"
            </p>
          </div>

          {/* Arrow */}
          <div className="flex-none flex items-center justify-center p-4 bg-white md:bg-transparent -my-4 md:my-0 md:-mx-4 z-10">
            <div className="bg-blue-600 rounded-full p-2 text-white shadow-lg transform md:rotate-0 rotate-90">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </div>
          </div>

          {/* After */}
          <div className="flex-1 p-6 bg-blue-50/30">
            <div className="flex items-center gap-2 mb-3">
              <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-md">교정 후</span>
              <span className="text-sm font-semibold text-gray-800">STAR 기법 완벽 교정 자소서</span>
            </div>
            <div className="space-y-2 text-sm text-gray-700 leading-relaxed">
              {example.after.map((item) => (
                <p key={item.label}>
                  <strong>[{item.label}]</strong> {item.content}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
