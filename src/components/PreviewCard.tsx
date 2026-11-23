"use client";

import { Fragment, useState } from "react";

const TABS = [
  { key: "IT", label: "IT/개발" },
  { key: "기획", label: "기획" },
  { key: "마케팅", label: "마케팅" },
  { key: "기타", label: "행정·고객응대" },
] as const;

type TabKey = typeof TABS[number]["key"];

interface ExampleData {
  before: string;
  /** {{ }}로 감싼 값은 지원자가 직접 채워 넣는 수치 예시입니다. AI가 만든 수치가 아닙니다. */
  after: { tag: string; label: string; content: string }[];
}

const EXAMPLES: Record<TabKey, ExampleData> = {
  IT: {
    before: "저는 웹 개발 프로젝트에 참여하여 프론트엔드 기능을 구현했습니다. 팀원들과 협업하며 좋은 결과를 만들었습니다.",
    after: [
      { tag: "S", label: "상황", content: "팀 프로젝트의 결제 페이지에서 사용자 이탈률이 {{38%}}에 달하는 문제를 발견했습니다." },
      { tag: "A", label: "행동", content: "React 상태 관리를 재설계하고 API 캐싱을 도입한 뒤, {{2주}}간 A/B 테스트를 주도했습니다." },
      { tag: "R", label: "결과", content: "결제 완료율이 {{12%p}} 오르고 첫 화면 로딩 시간이 {{1.4초}} 줄었습니다." },
    ],
  },
  기획: {
    before: "신규 서비스 기획 업무를 담당했습니다. 시장 조사와 기획서 작성을 통해 프로젝트를 성공적으로 진행했습니다.",
    after: [
      { tag: "S", label: "상황", content: "경쟁 서비스보다 회원가입 전환율이 {{9%p}} 낮은 원인을 찾아야 했습니다." },
      { tag: "A", label: "행동", content: "사용자 {{12명}} 심층 인터뷰와 퍼널 분석으로 5단계 가입 절차를 1단계로 줄이는 안을 기획했습니다." },
      { tag: "R", label: "결과", content: "가입 전환율이 {{1.6배}} 오르고, 이탈 구간을 매주 확인하는 지표 체계를 만들었습니다." },
    ],
  },
  마케팅: {
    before: "SNS 마케팅 캠페인을 기획하고 운영했습니다. 매력적인 콘텐츠 제작과 타겟팅을 통해 좋은 성과를 냈습니다.",
    after: [
      { tag: "S", label: "상황", content: "신규 브랜드 출시 직후 {{4주}} 동안 한정된 예산으로 인지도를 높여야 했습니다." },
      { tag: "A", label: "행동", content: "숏폼 광고 대상을 핵심 고객군으로 나누고, 소재 A/B 테스트 결과에 따라 매주 예산을 재배분했습니다." },
      { tag: "R", label: "결과", content: "클릭률이 {{2.3배}} 개선되고 광고비 대비 매출(ROAS) {{310%}}를 달성했습니다." },
    ],
  },
  기타: {
    before: "고객 응대 업무를 담당하며 다양한 현장 문제를 해결했습니다. 매사에 성실하고 꼼꼼하게 근무했습니다.",
    after: [
      { tag: "S", label: "상황", content: "성수기 문의가 몰려 팀 평균 응대 시간이 목표보다 {{40%}} 길어졌습니다." },
      { tag: "A", label: "행동", content: "가장 많이 들어오는 문의 {{10가지}}의 표준 답변을 만들고, 1차 처리 기준을 정리해 팀에 공유했습니다." },
      { tag: "R", label: "결과", content: "평균 처리 시간이 {{6분}}에서 {{4분}}으로 줄고 만족도 조사 점수가 올랐습니다." },
    ],
  },
};

/** {{값}} 부분을 '본인이 채우는 수치' 하이라이트로 렌더링 */
function renderWithUserFigures(text: string) {
  return text.split(/(\{\{[^}]+\}\})/g).map((part, i) => {
    const m = part.match(/^\{\{([^}]+)\}\}$/);
    if (!m) return <Fragment key={i}>{part}</Fragment>;
    return (
      <mark
        key={i}
        className="bg-amber-100 text-amber-900 font-semibold rounded px-1 py-0.5 decoration-amber-400 underline decoration-dotted underline-offset-2"
      >
        {m[1]}
      </mark>
    );
  });
}

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
    <div className="w-full bg-white rounded-3xl shadow-xl shadow-gray-900/5 ring-1 ring-gray-900/5 p-5 sm:p-7">
      <div className="flex flex-col gap-3 pb-5">
        <h3 className="text-base font-bold text-gray-900">이렇게 달라집니다</h3>
        <div className="flex items-center gap-1 overflow-x-auto -mx-1 px-1" role="tablist" aria-label="직무 예시">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors shrink-0 cursor-pointer ${
                activeTab === tab.key
                  ? "bg-gray-900 text-white"
                  : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className={`flex flex-col gap-4 transition-opacity duration-150 ${isFading ? "opacity-30" : "opacity-100"}`}>
        <div className="rounded-2xl bg-gray-50 p-4 sm:p-5 text-left">
          <p className="text-xs font-semibold text-gray-400 mb-2">교정 전</p>
          <p className="text-sm sm:text-[15px] text-gray-500 leading-relaxed break-keep line-through decoration-gray-300">
            {example.before}
          </p>
        </div>

        <div className="rounded-2xl bg-blue-50/60 ring-1 ring-blue-100 p-4 sm:p-5 text-left">
          <p className="text-xs font-semibold text-blue-600 mb-3">교정 후 · STAR 구조</p>
          <ol className="space-y-3">
            {example.after.map((item) => (
              <li key={item.tag} className="flex items-start gap-3">
                <span className="shrink-0 w-7 h-7 rounded-full bg-white ring-1 ring-blue-200 text-blue-700 text-xs font-bold flex items-center justify-center">
                  {item.tag}
                </span>
                <p className="text-sm sm:text-[15px] text-gray-800 leading-relaxed break-keep pt-0.5">
                  <span className="font-semibold text-gray-900">{item.label}</span>{" "}
                  {renderWithUserFigures(item.content)}
                </p>
              </li>
            ))}
          </ol>
        </div>

        <p className="text-xs text-gray-500 leading-relaxed break-keep">
          <mark className="bg-amber-100 text-amber-900 font-semibold rounded px-1">강조된 수치</mark>는 지원자가 본인
          경험으로 채워 넣는 예시입니다. AI는 수치를 지어내지 않고 입력할 자리만 표시합니다.
        </p>
      </div>
    </div>
  );
}
