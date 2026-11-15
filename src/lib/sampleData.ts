import { countResumeMetrics } from "@/lib/textMetrics";
import type { FreeDiagnosticResponse } from "@/lib/diagnoseRubric";
import type { InterviewQuestionItem, ResumeQuestionItem } from "@/lib/results";

export const SAMPLE_DISCLAIMER =
  "본 페이지의 채용 정보 구성·진단 리포트·자소서 완성본·면접 질문 예시는 공공기관 일반행정(NCS 경영·회계·사무) 공고 포맷을 바탕으로 제작된 가상 지원자 예시이며, 특정 기관의 공식 자료나 채용 심사 기준과 무관합니다.";

export const SAMPLE_POSTING_INFO = {
  instName: "가상 예시 공고 (공공기관 일반행정)",
  title: "신입직원 채용 — 경영·회계·사무 (일반행정 5급)",
  ncsCategory: "경영·회계·사무 (R600002)",
  employmentType: "정규직 (수습 3개월)",
  dDayBadge: "D-7",
};

export const SAMPLE_RAW_INPUT = `대학교 재학 중 경영학부 학생회 총무를 맡아 학과 예산을 관리했습니다. 처음에는 전임자의 인수인계 자료가 정리되어 있지 않아서 영수증 처리가 많이 지연되었지만, 저는 엑셀 정산 시트를 새로 만들어서 매월 말일 결산 보고를 올렸습니다. 또한 학교 근처에서 행정 아르바이트를 하면서 민원 응대 업무도 경험했고, 꼼꼼한 성격을 바탕으로 실수를 줄이려 노력했습니다. 한국도로공사처럼 국민에게 신뢰받는 공기업에 입사해서 투명하고 공정한 행정 업무를 수행하고 싶습니다.`;

export const SAMPLE_FULL_WEAKNESSES = [
  {
    id: "sw-1",
    categoryKey: "blind",
    title: "블라인드 채용 위반 의심 표현 포함 (기관명·신상 간접 노출)",
    severity: "high" as const,
    description:
      "입력 문단 맥락에서 '대학교', '경영학부' 등 출신 학력·전공 추론 키워드나 공고 외 기관명 혼용 위험 표현이 감지되었습니다. 공공기관 블라인드 심사에서는 '~대학 재학 중'을 '전공 프로젝트/자치 조직 활동 중'으로 순화해야 감점을 방지할 수 있습니다.",
  },
  {
    id: "sw-2",
    categoryKey: "metrics_role",
    title: "정량 성과 및 비교 기준(Before→After) 부재",
    severity: "high" as const,
    description:
      "'영수증 처리가 많이 지연되었다', '실수를 줄이려 노력했다'처럼 정성 형용사에 머물러 업무 개선 폭이 드러나지 않습니다. 소요 기간 변화나 누락 건수 감소율 등 검증 가능한 지표를 제시해야 경쟁력이 생깁니다.",
  },
  {
    id: "sw-3",
    categoryKey: "star",
    title: "Action(행동)의 구체적 의사결정 기준 설명 부족",
    severity: "medium" as const,
    description:
      "엑셀 정산 시트를 만들었다는 사실만 있고, 왜 기존 방식이 병목을 일으켰는지, 계정 과목 분류·증빙 규칙을 어떻게 표준화했는지 판단 근거가 빠져 있습니다.",
  },
  {
    id: "sw-4",
    categoryKey: "alignment",
    title: "직무 핵심 역량(예산 집행·내부통제·행정 정확성) 연결 미흡",
    severity: "medium" as const,
    description:
      "단순 경험 나열 후 '꼼꼼한 성격으로 열심히 하겠다'로 마무리되어 공공기관 경영·회계·사무 직무에서 요구하는 규정 준수·회계 투명성 역량과의 접점이 약합니다.",
  },
];

export const SAMPLE_DIAGNOSIS_SUMMARY: FreeDiagnosticResponse = {
  isFree: true,
  totalScore: 63,
  grade: "B",
  summary:
    "예산 정산 및 민원 응대 소재는 공기업 일반행정 직무에 적합하나, 블라인드 위반 위험 표현 정리와 정량 근거·STAR 인과 구체화가 반드시 보완되어야 합격권(80점 이상)에 진입합니다.",
  categories: [
    { key: "star", name: "STAR 프레임워크", score: 15, maxScore: 25, label: "보통" },
    { key: "metrics_role", name: "수치·역할 구체성", score: 13, maxScore: 25, label: "개선 필요" },
    { key: "alignment", name: "직무/문항 적합성", score: 14, maxScore: 20, label: "보통" },
    { key: "blind", name: "블라인드 규정 준수", score: 9, maxScore: 15, label: "주의" },
    { key: "length", name: "글자수/분량 적정성", score: 12, maxScore: 15, label: "양호" },
  ],
  metrics: {
    charCount: SAMPLE_RAW_INPUT.length,
    charCountNoSpaces: SAMPLE_RAW_INPUT.replace(/\s/g, "").length,
    byteCount2B: 486,
    targetChars: 500,
    fillRatio: 0.56,
    metricCount: 0,
  },
  blindSummary: {
    clean: false,
    totalViolations: 1,
    isLocked: true,
  },
  totalWeaknessCount: 4,
  topWeaknesses: SAMPLE_FULL_WEAKNESSES.slice(0, 2),
  lockedWeaknesses: SAMPLE_FULL_WEAKNESSES.slice(2).map((w) => ({
    id: w.id,
    categoryKey: w.categoryKey,
    title: w.title,
    severity: w.severity,
    isLocked: true,
  })),
  sampleFix: {
    title: "추상적 노력 서술을 '문제 원인 분석 → 표준화 실행 → 성과' 구조로 전환",
    beforeExcerpt:
      "전임자의 인수인계 자료가 정리되어 있지 않아서 영수증 처리가 많이 지연되었지만, 저는 엑셀 정산 시트를 새로 만들어서 매월 말일 결산 보고를 올렸습니다.",
    afterExample:
      "인수인계 문서 누락으로 정산 기한이 평균 5일 이상 지연되는 문제를 해결하기 위해, 지출 증빙 유형을 6개 항목으로 분류하고 자동 합산 검증 함수를 적용한 표준 정산 시트를 구축해 결산 지연을 0건으로 해소했습니다.",
    tip: "원인(인수인계 누락)과 본인의 해결 기준(6개 분류 + 자동 검증)을 선명히 연결하면 직무 전문성이 즉각 드러납니다.",
  },
};

function makeItem(id: string, order: number, title: string, body: string): ResumeQuestionItem {
  const m = countResumeMetrics(body, 500);
  return {
    id,
    order,
    title,
    body,
    charCount: m.charCount,
    byteCount: m.byteCount2B,
  };
}

export const SAMPLE_RESUME_ITEMS: ResumeQuestionItem[] = [
  makeItem(
    "q1",
    1,
    "1. 지원동기 및 기관 이해",
    "[투명한 행정 절차로 국민 신뢰를 뒷받침하는 실무자]\n공공기관의 경영·회계·사무 직무는 국민 예산을 적법한 기준 아래 집행하고 기관 사업이 흔들림 없이 추진되도록 지탱하는 핵심 기반입니다. 자치 조직 총무와 행정 아르바이트를 수행하며 작은 증빙 누락 하나가 전체 신뢰와 사업 일정을 좌우한다는 사실을 체감했습니다. 특히 다수의 이해관계자 민원을 처리하고 회계 장부를 월 단위로 정산한 경험은 공공기관이 요구하는 청렴성과 절차적 엄밀함에 부합합니다. 입사 후에도 규정과 데이터를 최우선 기준으로 삼아 오류 없는 예산 관리와 신속한 행정 지원을 구현하며 기관의 지속 가능한 성과 창출에 기여하겠습니다."
  ),
  makeItem(
    "q2",
    2,
    "2. 직무역량 및 문제해결 경험",
    "[지출 증빙 표준화 시트 구축으로 정산 오류 Zero 달성]\n자치 조직 총무 역할을 맡았을 당시, 전임자의 인수인계 문서가 부재해 월별 영수증 취합과 결산 보고가 매달 지연되는 문제가 발생했습니다. 이를 해결하기 위해 지난 회계 자료 [본인 수치 입력]건을 전수 분류하여 반복 누락 유형을 도출했습니다. 이후 품목별 예산 코드와 증빙 체크리스트를 자동 검증하는 엑셀 정산 템플릿을 직접 설계하고, 지출 발생 48시간 이내 등록 원칙을 도입했습니다. 그 결과 매월 말일 정시 결산 보고율 100%를 달성했으며, 행정 아르바이트 중에도 동일한 분류 체계를 적용해 민원 서류 확인 소요 시간을 단축했습니다."
  ),
  makeItem(
    "q3",
    3,
    "3. 협업·갈등 해결 경험",
    "[기준 공유와 데이터 기반 설득으로 정산 갈등 해소]\n행사 예산 집행을 조율하는 과정에서 사업 진행팀은 신속한 선지급을 요구했고, 회계 담당 측에서는 사전 증빙 미비를 이유로 집행을 보류해 일정 차질이 발생했습니다. 저는 양측의 입장을 경청한 뒤, 우선순위가 높은 필수 경비와 사후 정산 가능 항목을 기관 규정 기준으로 분리하는 절충안을 제안했습니다. 동시에 간소화된 1페이지 사전 품의 양식을 배포해 작성 부담을 절반 이상 낮췄습니다. 결과적으로 행사 일정 지연 없이 적법한 증빙을 100% 확보했으며, 구성원 간 신뢰 속에서 효율적 협업 문화를 정착시킬 수 있었습니다."
  ),
  makeItem(
    "q4",
    4,
    "4. 입사 후 포부 및 발전 계획",
    "[규정 준수와 디지털 행정 효율화를 연결하는 일반행정 전문가]\n입사 초기 1년 동안은 기관 회계·계약 규정과 전사적자원관리(ERP) 처리 절차를 완벽히 체득하여 담당 업무에서 단 한 건의 증빙 오류도 발생시키지 않는 실무자가 되겠습니다. 3년 차 이후에는 반복되는 수기 행정·정산 데이터를 표준화하고 유관 부서 간 협업 병목을 줄이는 업무 매뉴얼을 고도화하여 조직 전체의 예산 집행 투명성을 높이겠습니다. 아울러 관련 회계·공공계약 실무 지식을 꾸준히 심화시켜, 변화하는 공공 행정 환경 속에서도 공정성과 효율성을 함께 구현하는 핵심 인재로 성장하겠습니다."
  ),
];

export const SAMPLE_INTERVIEW_QUESTIONS: InterviewQuestionItem[] = [
  {
    number: 1,
    category: "지원동기·기관이해",
    question:
      "일반 기업 회계·경영관리 직무가 아닌 공공기관 일반행정(경영·회계·사무) 직무에 지원한 가장 결정적인 이유는 무엇입니까?",
    intent:
      "공공성과 수익성의 차이를 이해하고, 규정 준수·청렴성 가치에 기반한 지원 동기가 진정성 있는지 평가합니다.",
    answerTip:
      "자치 조직 회계 정산 과정에서 '투명성과 공정한 절차'의 중요성을 체감했던 경험을 공공기관의 대국민 책임성과 연결해 두괄식으로 답하세요.",
  },
  {
    number: 2,
    category: "직무역량·경험검증",
    question:
      "직접 설계했다는 '엑셀 정산 템플릿 및 자동 검증 함수'에서 구체적으로 어떤 오류를 어떻게 걸러냈는지 설명해 보세요.",
    intent:
      "자소서에 기재한 업무 개선 경험이 실제 본인이 설계·구현한 것인지 실무 디테일을 검증합니다.",
    answerTip:
      "사용한 검증 기준(예: 합계 불일치 경고, 증빙 유형 드롭다운, VLOOKUP/SUMIF 등)과 도입 전후 점검 시간 차이를 구체적으로 제시하세요.",
  },
  {
    number: 3,
    category: "협업·갈등해결",
    question:
      "행사 진행팀과 회계 기준 사이에서 절충안을 제시했을 때, 끝까지 규정을 불편해하며 협조하지 않는 팀원이 있었다면 어떻게 대응했겠습니까?",
    intent:
      "압박 꼬리질문 상황에서 원칙 고수와 유연한 소통 사이의 균형 감각을 확인합니다.",
    answerTip:
      "예외 허용은 감사 지적 및 기관 신뢰 저하로 이어짐을 명확히 안내하되, '1페이지 양식'처럼 상대의 실무 부담을 덜어주는 대안 제시 경험을 강조하세요.",
  },
  {
    number: 4,
    category: "공직윤리·딜레마",
    question:
      "상급자가 사업 마감을 이유로 증빙 영수증이 누락된 지출 건에 대해 '다음 달로 넘겨서 일단 통과시켜 달라'고 지시한다면 어떻게 하시겠습니까?",
    intent:
      "공공기관 경영·회계 직군 필수 검증 요소인 공직윤리·내부통제 원칙 준수 태도를 평가합니다.",
    answerTip:
      "규정 위반 소지를 정중하지만 단호히 보고하고, 대체 증빙(카드 매출전표·검수조서 등) 적법 절차를 확인해 적정 회계 연도 내 보완 처리하는 원칙을 밝히세요.",
  },
  {
    number: 5,
    category: "직무역량·민원응대",
    question:
      "행정 아르바이트 중 경험한 가장 까다로웠던 민원 상황은 무엇이었으며, 어떤 기준으로 문제를 종결했습니까?",
    intent:
      "감정적 민원 응대 시 규정 설명 능력과 스트레스 관리 역량을 확인합니다.",
    answerTip:
      "경청(감정 수용) → 사실관계·규정 확인 → 가능한 대안 및 처리 기한 명확 고지 3단계 순서로 설명하세요.",
  },
  {
    number: 6,
    category: "경험검증",
    question:
      "자치 조직 총무 업무에서 본인 외에 다른 임원들은 어떤 역할을 했고, 인수인계 문서화를 왜 본인이 직접 주도하게 되었습니까?",
    intent:
      "팀 내 주도성(Role)과 책임감을 확인하고 과장 서술 여부를 점검합니다.",
    answerTip:
      "기존 임원진의 역할 분담을 객관적으로 구분한 뒤, 매달 반복되는 확인 질문과 누락 스트레스를 직접 해결하기 위해 자발적으로 표준화에 나선 동기를 설명하세요.",
  },
  {
    number: 7,
    category: "직무지식",
    question:
      "공공기관 예산 집행에서 '신속 집행'과 '적정 집행(증빙 철저)'이 충돌할 때 실무자는 무엇을 기준으로 판단해야 합니까?",
    intent:
      "실제 공공기관 예산·계약 실무의 딜레마 상황에 대한 논리적 사고력을 봅니다.",
    answerTip:
      "적법성이 전제되지 않은 신속성은 감사 리스크가 되므로 적정성을 기본 원칙으로 두되, 사전 체크리스트로 검토 리드타임을 줄여 두 목표를 병행해야 한다고 답하세요.",
  },
  {
    number: 8,
    category: "협업·커뮤니케이션",
    question:
      "유관 부서에 정산 서류 제출 마감 공지를 여러 번 보냈음에도 회신이 오지 않을 때 어떤 방식으로 기한을 준수시킵니까?",
    intent:
      "타 부서와의 실무 조율 추진력과 현실적인 일정 관리 방식을 확인합니다.",
    answerTip:
      "단순 독촉 메일보다 마감 D-3 요약 리스트 공유, 1:1 유선 확인, 필수 항목 3가지만 먼저 회신받는 단계적 관리 노하우를 말하세요.",
  },
  {
    number: 9,
    category: "지원동기·기관이해",
    question:
      "최근 공공기관 경영평가나 공공 행정 효율화 이슈 중 관심 있게 본 사례가 있다면 일반행정 직무 관점에서 의견을 말씀해 보세요.",
    intent:
      "지원 직무에 대한 평소 관심도와 공공 부문 트렌드 이해도를 검증합니다.",
    answerTip:
      "특정 기관명 언급 대신 공공기관 디지털 행정 전환·ESG 투명경영·부패방지 내부통제 강화 같은 보편적 흐름과 본인의 데이터 정산 역량을 연결하세요.",
  },
  {
    number: 10,
    category: "입사후포부·마무리",
    question:
      "입사 후 가장 먼저 배우고 싶은 실무 시스템이나 역량은 무엇이며, 3년 뒤 동료들에게 어떤 실무자로 기억되고 싶습니까?",
    intent:
      "조직 적응 의지와 장기적인 성장 방향의 일관성을 최종 확인합니다.",
    answerTip:
      "기관 ERP·국가계약법 등 기초 실무 숙달 계획과 함께 '기준은 꼼꼼히 지키되 협업 과정은 명확하고 유연한 동료'로 구체적 비전을 마무리하세요.",
  },
];
