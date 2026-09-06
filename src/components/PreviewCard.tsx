"use client";

import { useState } from "react";

const TABS = [
  { key: "IT", label: "IT/개발" },
  { key: "기획", label: "기획" },
  { key: "마케팅", label: "마케팅" },
  { key: "기타", label: "기타" },
] as const;

type TabKey = typeof TABS[number]["key"];

interface ExampleData {
  before: string;
  after: { label: string; tag: string; content: string }[];
}

const EXAMPLES: Record<TabKey, ExampleData> = {
  "IT": {
    before: "저는 웹 개발 프로젝트에 참여하여 프론트엔드 기능을 구현했습니다. 팀원들과 협업하며 좋은 결과를 만들었습니다.",
    after: [
      { tag: "S", label: "Situation (상황)", content: "5인 팀 프로젝트에서 결제 페이지 사용자 이탈률 30% 발생 문제 직면" },
      { tag: "T/A", label: "Task & Action (과제 및 행동)", content: "React 상태관리 재설계 및 API 캐싱 로직 도입, 2주간 A/B 테스트 주도" },
      { tag: "R", label: "Result (성과)", content: "결제 완료율 18% 상승, 초기 로딩 시간 1.2초 단축 달성" },
    ]
  },
  "기획": {
    before: "신규 서비스 기획 업무를 담당했습니다. 시장 조사와 기획서 작성을 통해 프로젝트를 성공적으로 진행했습니다.",
    after: [
      { tag: "S", label: "Situation (상황)", content: "경쟁사 대비 온보딩 단계 가입 전환율이 40% 저조한 원인 파악 필요" },
      { tag: "T/A", label: "Task & Action (과제 및 행동)", content: "12건의 심층 인터뷰 및 퍼널 분석을 거쳐 3단계 회원가입을 1단계로 단순화 기획" },
      { tag: "R", label: "Result (성과)", content: "최종 가입 전환율 22%p 상승 및 핵심 이탈 지점 모니터링 체계 구축" },
    ]
  },
  "마케팅": {
    before: "SNS 마케팅 캠페인을 기획하고 운영했습니다. 매력적인 콘텐츠 제작과 타겟팅을 통해 좋은 성과를 냈습니다.",
    after: [
      { tag: "S", label: "Situation (상황)", content: "신규 브랜드 런칭 직후 초기 3주간 한정된 예산 내 인지도 극대화 과제" },
      { tag: "T/A", label: "Task & Action (과제 및 행동)", content: "숏폼 채널 타겟을 3개 세그먼트로 분리 후 크리에이티브 A/B 테스트 및 주간 예산 리밸런싱" },
      { tag: "R", label: "Result (성과)", content: "CTR 2.3배 개선 및 광고비 대비 매출액(ROAS) 340% 달성" },
    ]
  },
  "기타": {
    before: "고객 응대 업무를 담당하며 다양한 현장 문제를 해결했습니다. 매사에 성실하고 꼼꼼하게 근무했습니다.",
    after: [
      { tag: "S", label: "Situation (상황)", content: "성수기 고객 문의 폭증으로 팀 평균 응대 소요시간이 목표치를 40분 초과" },
      { tag: "T/A", label: "Task & Action (과제 및 행동)", content: "최다 빈도 문의 10종 표준 응답 템플릿화 및 1차 처리 자동화 가이드라인 수립" },
      { tag: "R", label: "Result (성과)", content: "평균 처리시간 35% 단축, CS 만족도 4.6점(5점 만점) 갱신" },
    ]
  },
};

export default function PreviewCard() {
  const [activeTab, setActiveTab] = useState<TabKey>("IT");
  const [isFading, setIsFading] = useState(false);

  const handleTabChange = (tab: TabKey) => {
    if (tab === activeTab) return;
    setIsFading(true);
    setTimeout(() => {
      setActiveTab(tab);
      setIsFading(false);
    }, 120);
  };

  const example = EXAMPLES[activeTab];

  return (
    <div className="w-full bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6 transition-all">
      {/* Header & 직무 탭 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-600" />
          <h3 className="text-sm font-bold text-gray-900 tracking-tight">
            AI 교정 전 / 후 증거 미리보기
          </h3>
        </div>
        
        {/* 직무 탭 */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`
                px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-150 shrink-0 cursor-pointer
                ${activeTab === tab.key
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900"
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Before / After 비교 영역 */}
      <div
        className={`pt-4 flex flex-col gap-3.5 transition-opacity duration-150 ${
          isFading ? "opacity-30" : "opacity-100"
        }`}
      >
        {/* Before 박스: 연회색 배경, 좌측 정렬 */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-left">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-0.5 bg-gray-200 text-gray-700 text-xs font-bold rounded">
              교정 전
            </span>
            <span className="text-xs text-gray-500 font-medium">평범하고 추상적인 문장</span>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed break-keep">
            "{example.before}"
          </p>
        </div>

        {/* 연결 인디케이터 */}
        <div className="flex items-center justify-center -my-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-blue-50 border border-blue-100 text-[11px] font-bold text-blue-700">
            <svg className="w-3 h-3 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
            STAR 프레임워크 자동 변환
          </div>
        </div>

        {/* After 박스: 연초록색 배경, 좌측 정렬, STAR 볼드 강조 */}
        <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 text-left">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-xs font-bold rounded">
                교정 후 · STAR 적용
              </span>
              <span className="text-xs text-emerald-700 font-semibold">구체적 성과 중심 완성본</span>
            </div>
            <span className="text-[11px] text-emerald-600 font-medium hidden sm:inline">합격률 제고</span>
          </div>
          
          <div className="space-y-2.5 text-xs sm:text-sm text-gray-800 leading-relaxed">
            {example.after.map((item, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <span className="shrink-0 text-[11px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-200/80 text-emerald-900 leading-none mt-0.5">
                  {item.tag}
                </span>
                <p className="break-keep">
                  <strong className="font-bold text-gray-900">[{item.label}]</strong>{" "}
                  <span className="text-gray-700">{item.content}</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
