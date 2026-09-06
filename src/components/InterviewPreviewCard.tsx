"use client";

import { useState } from "react";

const TABS = [
  { key: "IT", label: "IT/개발" },
  { key: "기획", label: "기획" },
  { key: "마케팅", label: "마케팅" },
  { key: "기타", label: "기타 직무" },
] as const;

type TabKey = typeof TABS[number]["key"];

interface InterviewExample {
  resumeSnippet: string;
  questions: {
    step: string;
    stepTag: string;
    title: string;
    desc: string;
    question: string;
    color: string;
  }[];
}

const EXAMPLES: Record<TabKey, InterviewExample> = {
  IT: {
    resumeSnippet: "웹 결제 페이지 이탈률 30% 문제를 해결하기 위해 React 상태관리를 재설계하고 API 캐싱을 적용해 완료율을 18% 개선했습니다.",
    questions: [
      {
        step: "1단계",
        stepTag: "사실 확인",
        title: "상황/행동 사실 확인",
        desc: "실제 기여도 및 기술 스택 검증",
        question: "React 상태관리를 구체적으로 어떤 아키텍처로 재설계하셨습니까? 캐싱 무효화(Cache Invalidation) 정책은 어떻게 정의하셨나요?",
        color: "bg-blue-100 text-blue-800 border-blue-200",
      },
      {
        step: "2단계",
        stepTag: "의사결정",
        title: "의사결정 근거 검증",
        desc: "대안 비교 및 논리적 타당성",
        question: "API 캐싱 외에 서버 사이드 렌더링(SSR)이나 CDN 엣지 최적화 등 다른 대안은 왜 채택하지 않으셨습니까?",
        color: "bg-indigo-100 text-indigo-800 border-indigo-200",
      },
      {
        step: "3단계",
        stepTag: "심층 압박",
        title: "압박 및 모순 지적",
        desc: "결과의 신빙성 및 한계 파고들기",
        question: "18% 완료율 개선이 순수하게 프론트 캐싱의 효과라고 어떻게 단정하십니까? 동 시기 마케팅 할인 프로모션의 기여분은 어떻게 분리 검증하셨습니까?",
        color: "bg-red-100 text-red-800 border-red-200",
      },
    ],
  },
  기획: {
    resumeSnippet: "온보딩 회원가입 전환율 개선을 위해 3단계를 1단계로 축소 기획하여 최종 가입 전환율 22%p 상승을 이끌어냈습니다.",
    questions: [
      {
        step: "1단계",
        stepTag: "사실 확인",
        title: "상황/행동 사실 확인",
        desc: "실제 기여도 및 기술 스택 검증",
        question: "가입 퍼널을 1단계로 축소하면서 생략된 필수 유저 데이터는 이후 어떤 퍼널에서 보완 수집하셨습니까?",
        color: "bg-blue-100 text-blue-800 border-blue-200",
      },
      {
        step: "2단계",
        stepTag: "의사결정",
        title: "의사결정 근거 검증",
        desc: "대안 비교 및 논리적 타당성",
        question: "단순 단계 축소 외에 소셜 간편 로그인 도입이나 이탈률이 높은 특정 인풋 최적화 방안은 왜 우선순위에서 밀렸습니까?",
        color: "bg-indigo-100 text-indigo-800 border-indigo-200",
      },
      {
        step: "3단계",
        stepTag: "심층 압박",
        title: "압박 및 모순 지적",
        desc: "결과의 신빙성 및 한계 파고들기",
        question: "가입 장벽을 낮춤으로써 발생할 수 있는 허수 계정 및 스팸 유저 증가로 장기 리텐션(D+30)이 저하되지는 않았습니까?",
        color: "bg-red-100 text-red-800 border-red-200",
      },
    ],
  },
  마케팅: {
    resumeSnippet: "숏폼 채널 타겟을 3개 세그먼트로 분리 후 크리에이티브 A/B 테스트와 주간 예산 리밸런싱을 통해 ROAS 340%를 달성했습니다.",
    questions: [
      {
        step: "1단계",
        stepTag: "사실 확인",
        title: "상황/행동 사실 확인",
        desc: "실제 기여도 및 기술 스택 검증",
        question: "A/B 테스트를 진행할 때 통계적 유의성(p-value)을 충족하기 위한 최소 모수(Sample Size)는 어떻게 설정하셨습니까?",
        color: "bg-blue-100 text-blue-800 border-blue-200",
      },
      {
        step: "2단계",
        stepTag: "의사결정",
        title: "의사결정 근거 검증",
        desc: "대안 비교 및 논리적 타당성",
        question: "예산 리밸런싱 주기를 일간이 아닌 주간 단위로 설정한 이유는 무엇이며, 급변하는 알고리즘 변동에 충분히 민첩했습니까?",
        color: "bg-indigo-100 text-indigo-800 border-indigo-200",
      },
      {
        step: "3단계",
        stepTag: "심층 압박",
        title: "압박 및 모순 지적",
        desc: "결과의 신빙성 및 한계 파고들기",
        question: "ROAS 340%에 기존 브랜드 인지도(Organic 유입)나 리타겟팅 풀의 기여분이 과대 계상된 것은 아닙니까?",
        color: "bg-red-100 text-red-800 border-red-200",
      },
    ],
  },
  기타: {
    resumeSnippet: "성수기 고객 문의 폭증 상황에서 최다 빈도 10종 표준 응답 템플릿화로 평균 처리 시간을 35% 단축했습니다.",
    questions: [
      {
        step: "1단계",
        stepTag: "사실 확인",
        title: "상황/행동 사실 확인",
        desc: "실제 기여도 및 기술 스택 검증",
        question: "10종 템플릿을 표준화하는 과정에서 기존 관행을 고수하려는 동료 및 유관부서의 이견은 어떻게 조율하셨습니까?",
        color: "bg-blue-100 text-blue-800 border-blue-200",
      },
      {
        step: "2단계",
        stepTag: "의사결정",
        title: "의사결정 근거 검증",
        desc: "대안 비교 및 논리적 타당성",
        question: "기계적 템플릿 응대로 인해 고객이 무성의하다고 느낄 수 있는 리스크는 어떻게 모니터링하고 방지하셨습니까?",
        color: "bg-indigo-100 text-indigo-800 border-indigo-200",
      },
      {
        step: "3단계",
        stepTag: "심층 압박",
        title: "압박 및 모순 지적",
        desc: "결과의 신빙성 및 한계 파고들기",
        question: "단순 처리 시간은 줄었으나, 동일 이슈에 대한 재인입률(FCR 미달)이나 실질 고객 만족도 점수는 검증해 보셨습니까?",
        color: "bg-red-100 text-red-800 border-red-200",
      },
    ],
  },
};

export default function InterviewPreviewCard() {
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
            자소서 기반 3단계 꼬리질문 미리보기
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
                ${
                  activeTab === tab.key
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

      {/* 미리보기 본문 */}
      <div
        className={`pt-4 flex flex-col gap-3.5 transition-opacity duration-150 ${
          isFading ? "opacity-30" : "opacity-100"
        }`}
      >
        {/* 상단: 자소서 대표 문장 */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-left">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-gray-200 text-gray-700 text-xs font-bold rounded">
                제출 자소서 문장
              </span>
              <span className="text-xs text-gray-500 font-medium">실제 작성한 한 줄</span>
            </div>
            <span className="text-[11px] text-gray-400">면접관 타겟팅</span>
          </div>
          <p className="text-sm text-gray-700 leading-relaxed break-keep font-medium">
            "{example.resumeSnippet}"
          </p>
        </div>

        {/* 연결 인디케이터 */}
        <div className="flex items-center justify-center -my-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-blue-50 border border-blue-100 text-[11px] font-bold text-blue-700">
            <svg className="w-3 h-3 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
            실전 실무진 3단계 심층 압박 검증
          </div>
        </div>

        {/* 하단: 3단계 꼬리질문 카드 */}
        <div className="space-y-2.5">
          {example.questions.map((q, idx) => (
            <div
              key={idx}
              className="bg-white border border-gray-200 hover:border-blue-300 rounded-xl p-3.5 text-left transition-all shadow-xs"
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 text-[11px] font-bold rounded border ${q.color}`}>
                    {q.step} · {q.stepTag}
                  </span>
                  <span className="text-xs font-bold text-gray-900">{q.title}</span>
                </div>
                <span className="text-[10.5px] text-gray-400 hidden sm:inline">{q.desc}</span>
              </div>
              <p className="text-xs sm:text-sm text-gray-800 leading-relaxed break-keep pl-1">
                "{q.question}"
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
