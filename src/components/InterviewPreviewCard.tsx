"use client";

import { useState } from "react";

const TABS = [
  { key: "경영·회계·사무", label: "공공기관 경영·사무" },
  { key: "기술·전산(NCS)", label: "공기업 기술·전산" },
  { key: "공공서비스·민원", label: "대민·행정" },
  { key: "IT", label: "IT/개발" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

interface InterviewExample {
  ncsTag: string;
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
  "경영·회계·사무": {
    ncsTag: "문제해결능력 · 자원관리능력",
    resumeSnippet:
      "예시) 행정 인턴 기간 중 부서 계약 서류 체크리스트와 기한 알림 표를 정비하여 보완 요청이 반복되던 지출 결의 검수 지연 시간을 단축했습니다.",
    questions: [
      {
        step: "1단계",
        stepTag: "사실 확인",
        title: "상황/행동 사실 확인",
        desc: "본인 고유 역할·규정 준수 검증",
        question:
          "체크리스트를 정비하실 때 기존 지출 결의 기준에서 가장 누락이 잦았던 항목은 무엇이며, 본인 단독 판단인지 담당 주무관 승인 절차였는지 구분해 말씀해 주시겠습니까?",
        color: "bg-blue-100 text-blue-800 border-blue-200",
      },
      {
        step: "2단계",
        stepTag: "일관성·근거",
        title: "의사결정 기준 검증",
        desc: "대안 비교 및 자소서 일관성",
        question:
          "단순 체크리스트 배포 외에 시스템 알림 연동 등 다른 대안은 검토하지 않으셨습니까? 인턴 종료 후에도 현업에서 지속 활용되었습니까?",
        color: "bg-indigo-100 text-indigo-800 border-indigo-200",
      },
      {
        step: "3단계",
        stepTag: "심층 압박",
        title: "규정·공직가치 압박",
        desc: "원칙 준수 vs 신속 처리 딜레마",
        question:
          "만약 마감 당일 상급자가 증빙 서류가 1건 미비한 상태에서 선결재를 요청한다면, 규정을 우선하시겠습니까 아니면 사업 지연을 막기 위해 예외 처리하시겠습니까?",
        color: "bg-red-100 text-red-800 border-red-200",
      },
    ],
  },
  "기술·전산(NCS)": {
    ncsTag: "기술능력 · 정보능력",
    resumeSnippet:
      "예시) 대국민 포털 민원 조회 API의 검색 쿼리 인덱스를 재설계하고 캐시 만료 정책을 수립해 야간 배치 충돌 없이 응답 속도를 개선했습니다.",
    questions: [
      {
        step: "1단계",
        stepTag: "사실 확인",
        title: "기술 기여도 확인",
        desc: "실제 설계 수준 및 보안 기준",
        question:
          "인덱스 재설계 전 실행 계획(Explain) 분석은 직접 수행하셨습니까? 개인정보가 포함된 민원 데이터의 캐시 격리 원칙은 어떻게 세우셨습니까?",
        color: "bg-blue-100 text-blue-800 border-blue-200",
      },
      {
        step: "2단계",
        stepTag: "일관성·근거",
        title: "대안 비교 및 트레이드오프",
        desc: "구조 선택의 타당성 검증",
        question:
          "인덱스 추가에 따른 쓰기(INSERT/UPDATE) 성능 저하와 야간 배치 부하는 어떤 기준으로 허용 범위를 산정하셨습니까?",
        color: "bg-indigo-100 text-indigo-800 border-indigo-200",
      },
      {
        step: "3단계",
        stepTag: "심층 압박",
        title: "장애 대응 압박",
        desc: "무중단 운영 및 책임성",
        question:
          "캐시 정합성 오류로 민원인에게 구버전 상태가 안내되는 장애가 발생한다면, 복구 전 대국민 공지와 롤백 판단은 어떤 절차로 내리시겠습니까?",
        color: "bg-red-100 text-red-800 border-red-200",
      },
    ],
  },
  "공공서비스·민원": {
    ncsTag: "의사소통능력 · 직업윤리",
    resumeSnippet:
      "예시) 현장 안내 지원 업무 중 규정 외 지원금 소급 적용을 요구하는 반복 민원인에게 관련 조항과 대체 신청 절차를 안내하여 분쟁을 원만히 해소했습니다.",
    questions: [
      {
        step: "1단계",
        stepTag: "사실 확인",
        title: "대민 소통 사실 검증",
        desc: "실제 응대 절차와 기록",
        question:
          "감정적으로 격앙된 민원인을 상대로 어떤 순서로 사실관계를 확인하고, 당시 현장에서 직접 작성한 민원 응대 기록은 어떻게 남기셨습니까?",
        color: "bg-blue-100 text-blue-800 border-blue-200",
      },
      {
        step: "2단계",
        stepTag: "일관성·근거",
        title: "기준 설명 및 협업",
        desc: "대체 절차 제안 근거",
        question:
          "단순 불가 안내가 아니라 대체 신청 절차를 안내하기 위해 유관 부서와 사전에 어떤 기준을 협의하셨습니까?",
        color: "bg-indigo-100 text-indigo-800 border-indigo-200",
      },
      {
        step: "3단계",
        stepTag: "심층 압박",
        title: "특혜 요구·윤리 압박",
        desc: "청렴·공정성 원칙 시험",
        question:
          "민원인이 지역 유지나 내부 직원의 지인이라며 비공식 편의를 계속 요구할 경우, 조직 내 불편함을 감수하고 어떤 원칙으로 거절하시겠습니까?",
        color: "bg-red-100 text-red-800 border-red-200",
      },
    ],
  },
  IT: {
    ncsTag: "기술능력 · 문제해결능력",
    resumeSnippet:
      "예시) 결제 화면 상태관리 재설계와 API 캐시 정책 정비를 통해 중복 요청 오류를 줄이고 사용자 이탈 원인을 단계별로 개선했습니다.",
    questions: [
      {
        step: "1단계",
        stepTag: "사실 확인",
        title: "상황/행동 사실 확인",
        desc: "실제 기여도 및 기술 스택 검증",
        question:
          "상태관리 재설계에서 본인이 직접 작성한 모듈 범위와 API 캐싱 무효화(Cache Invalidation) 조건은 구체적으로 어떻게 정의하셨습니까?",
        color: "bg-blue-100 text-blue-800 border-blue-200",
      },
      {
        step: "2단계",
        stepTag: "일관성·근거",
        title: "의사결정 근거 검증",
        desc: "대안 비교 및 논리적 타당성",
        question:
          "클라이언트 상태 캐싱 대신 서버 멱등성 키나 요청 큐 방식으로 해결하지 않고 프론트 중심 개편을 선택한 근거는 무엇입니까?",
        color: "bg-indigo-100 text-indigo-800 border-indigo-200",
      },
      {
        step: "3단계",
        stepTag: "심층 압박",
        title: "압박 및 모순 지적",
        desc: "결과의 신빙성 및 한계 파고들기",
        question:
          "오류 감소가 본인의 상태관리 개편 덕분이라는 점을 동시기 다른 배포 변경분과 어떻게 분리 검증하셨습니까?",
        color: "bg-red-100 text-red-800 border-red-200",
      },
    ],
  },
};

export default function InterviewPreviewCard() {
  const [activeTab, setActiveTab] = useState<TabKey>("경영·회계·사무");
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
            공공기관 NCS 3단계 꼬리질문 · 채점 미리보기
          </h3>
        </div>

        {/* 직무 탭 */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
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
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-gray-200 text-gray-700 text-xs font-bold rounded">
                자소서 원문
              </span>
              <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                NCS: {example.ncsTag}
              </span>
            </div>
            <span className="text-[11px] text-gray-400">일관성·역할 대조 기준</span>
          </div>
          <p className="text-xs sm:text-sm text-gray-700 leading-relaxed break-keep font-medium">
            &ldquo;{example.resumeSnippet}&rdquo;
          </p>
        </div>

        {/* 연결 인디케이터 */}
        <div className="flex items-center justify-center -my-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-blue-50 border border-blue-100 text-[11px] font-bold text-blue-700">
            <svg className="w-3 h-3 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
            직전 답변 약점 기반 동적 3단계 압박 · 100점 루브릭 채점
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
                &ldquo;{q.question}&rdquo;
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
