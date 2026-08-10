export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  date: string;
}

export const blogPosts: BlogPost[] = [
  {
    slug: 'star-method-resume',
    title: '합격하는 자소서의 비밀, STAR 기법 완전 정복',
    excerpt: '면접관의 눈길을 사로잡는 STAR 기법의 핵심과 직무별 적용 예시를 알아봅니다.',
    content: `자기소개서를 작성할 때 가장 막막한 부분은 "내 경험을 어떻게 매력적으로 포장할 것인가"입니다.\n\n이때 가장 확실하고 검증된 프레임워크가 바로 STAR 기법입니다.\n\nS (Situation) : 어떤 상황이었는가?\nT (Task) : 내게 주어진 과제나 목표는 무엇이었는가?\nA (Action) : 그 문제를 해결하기 위해 내가 취한 구체적인 행동은 무엇인가?\nR (Result) : 그 결과 어떤 성과를 얻었으며, 무엇을 배웠는가?\n\n이 4가지 구조에 맞춰 글을 작성하면 면접관이 가장 읽기 편하고 논리적인 자소서가 완성됩니다. (여기에 1,500자 이상의 양질의 내용이 들어갑니다)`,
    date: '2026-08-10',
  },
  {
    slug: 'large-corp-interview-trend',
    title: '2026년 하반기 대기업 면접 트렌드 분석',
    excerpt: '최신 채용 트렌드와 반드시 준비해야 할 꼬리 질문 리스트를 공개합니다.',
    content: `2026년 하반기 대기업 채용 면접은 직무 적합성과 문제 해결 능력을 중점적으로 평가하는 경향이 강해졌습니다.\n\n단순한 경험 나열보다는 실제 업무 상황에서 발생할 수 있는 문제를 어떻게 해결할 것인지 묻는 상황 면접(Scenario Interview)의 비중이 늘어나고 있습니다.\n\n이러한 트렌드에 대비하기 위해서는 본인의 과거 경험을 구체적인 사례(STAR 기법)로 정리하고, 직무와 관련된 인사이트를 명확히 전달하는 연습이 필요합니다. (여기에 1,500자 이상의 양질의 내용이 들어갑니다)`,
    date: '2026-08-08',
  },
];

export const getPostData = (slug: string): BlogPost | null => {
  return blogPosts.find((post) => post.slug === slug) || null;
};
