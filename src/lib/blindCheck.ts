/**
 * 공공기관 및 공기업 블라인드 채용 가이드라인 기반 위반 탐지 유틸리티
 *
 * [오탐 방지 원칙]:
 * - '대응', '대상', '기대', '대인관계', '최대', '대규모', '시대', '대다수', '대표' 등
 *   일반 명사·용언의 '대'는 절대 탐지하지 않습니다.
 * - 학력은 'OO대학교', 'OO대 졸업/재학/출신' 등 명백한 학력 식별 문맥 또는 주요 공인 대학 명칭으로만 한정합니다.
 */

export type BlindViolationCategory =
  | "school" // 출신학교 및 학력
  | "family" // 가족관계 및 부모 직업/사회적 신분
  | "region" // 출신지역 및 고향
  | "age_gender" // 나이, 성별, 병역
  | "contact"; // 연락처, 주민번호, 이메일 등 개인식별정보

export interface BlindViolation {
  category: BlindViolationCategory;
  categoryLabel: string;
  matchedText: string;
  index: number;
  message: string;
}

export interface BlindCheckResult {
  clean: boolean;
  totalViolations: number;
  violations: BlindViolation[];
}

interface PatternRule {
  category: BlindViolationCategory;
  categoryLabel: string;
  regex: RegExp;
  message: string;
}

const KOREAN_PARTICLE_OR_END =
  "(?=(?:[은는이가을를의와과도에로]|에서|으로|\\s|[.,!?)일\\]]|$))";

const BLIND_RULES: PatternRule[] = [
  // 1. 개인 식별 정보 (주민등록번호, 전화번호, 이메일)
  {
    category: "contact",
    categoryLabel: "개인 식별 정보",
    regex: /\b\d{6}\s*[-–—]\s*[1-4]\d{6}\b/g,
    message: "주민등록번호는 블라인드 채용 감점 및 실격 처리 대상입니다.",
  },
  {
    category: "contact",
    categoryLabel: "연락처",
    regex: /\b01[016789]\s*[-–—.]?\s*\d{3,4}\s*[-–—.]?\s*\d{4}\b/g,
    message: "휴대전화번호는 블라인드 위반 대상입니다.",
  },
  {
    category: "contact",
    categoryLabel: "이메일",
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    message: "개인 이메일 주소는 블라인드 위반 대상입니다.",
  },

  // 2. 출신 학교 및 학력
  // (1) 대학교, 대학원, 여자대학교 등 명시적 학교 명칭
  {
    category: "school",
    categoryLabel: "출신 학교",
    regex: new RegExp(
      "[가-힣]{2,15}(?:대학교|대학원|여자대학교|사이버대학교|산업대학교|기술대학교)" +
        KOREAN_PARTICLE_OR_END,
      "g"
    ),
    message: "대학교/대학원 명칭은 블라인드 평가 규정상 마스킹되어야 합니다.",
  },
  // (2) 'OO대 졸업', 'OO대 재학', 'OO대 출신', 'OO대 캠퍼스' 등 문맥 수반 축약형
  {
    category: "school",
    categoryLabel: "출신 학교",
    regex: /[가-힣]{2,8}대(?:\s+[가-힣]+)?\s*(?:졸업|재학|출신|입학|학사|석사|박사|캠퍼스|중퇴|휴학)/g,
    message: "출신 대학을 유추할 수 있는 표현은 블라인드 위반입니다.",
  },
  // (3) 주요 대학 약칭 단독 표기
  {
    category: "school",
    categoryLabel: "출신 학교",
    regex: new RegExp(
      "(?:서울대|연세대|고려대|카이스트|포항공대|성균관대|한양대|서강대|중앙대|경희대|한국외대|서울시립대|이화여대|숙명여대|건국대|동국대|홍익대|국민대|숭실대|세종대|단국대|부산대|경북대|전남대|충남대|전북대|충북대|강원대|제주대)" +
        KOREAN_PARTICLE_OR_END,
      "g"
    ),
    message: "특정 대학교 약칭은 블라인드 위반 사유가 됩니다.",
  },
  // (4) 고등학교 (외고, 자사고, 마이스터고 포함)
  {
    category: "school",
    categoryLabel: "출신 고교",
    regex: new RegExp(
      "[가-힣]{2,10}(?:고등학교|외고|과고|자사고|마이스터고)" + KOREAN_PARTICLE_OR_END,
      "g"
    ),
    message: "출신 고등학교 명칭은 블라인드 위반 대상입니다.",
  },
  // (5) 학점 수치 명시 (예: 4.2/4.5, 학점 3.8 등)
  {
    category: "school",
    categoryLabel: "학점",
    regex: /(?:학점|GPA)\s*(?:은|이)?\s*\d\.\d{1,2}|\b\d\.\d{1,2}\s*\/\s*(?:4\.5|4\.3|4\.0)\b/g,
    message: "구체적인 학점 표기는 학력 블라인드 감점 대상입니다.",
  },

  // 3. 가족관계 및 부모 직업/사회적 배경
  {
    category: "family",
    categoryLabel: "가족 직업/신분",
    regex: /(?:아버지|어머니|부모님|아버님|어머님|삼촌|외삼촌|이모|고모|조부모|조부|조모|형제|자매)\s*(?:께서|는|의|가|도)?\s*(?:운영하시는\s*)?(?:[가-힣]{1,10}\s*)?(?:공무원|임원|대표|교수|의사|판사|검사|변호사|세무사|회계사|국회의원|장관|차관|경찰|군인|공기업|대기업|회사|사업)/g,
    message: "가족의 직업 또는 사회적 신분을 암시하는 서술은 블라인드 실격 사유입니다.",
  },
  {
    category: "family",
    categoryLabel: "가족 배경",
    regex: /(?:부모님|아버지|어머니)\s*(?:의\s*)?(?:회사|사업체|병원|연구소|사무실)에서\s*(?:일하며|경험|근무|배우며|인턴)/g,
    message: "가족 사업체나 부모 관련 기관에서의 근무 언급은 블라인드 위반입니다.",
  },

  // 4. 출신 지역 및 고향
  {
    category: "region",
    categoryLabel: "출신 지역",
    regex: /(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주|호남|영남|충청)(?:도|시|군|구)?(?:\s+[가-힣]{1,5}[시군구])?\s*(?:에서\s*(?:태어나|나고\s*자란?|자란?|출신|토박이))/g,
    message: "출신 지역 및 성장 고향에 관한 직접적 서술은 블라인드 위반입니다.",
  },
  {
    category: "region",
    categoryLabel: "출신 지역",
    regex: /(?:출신지|고향|본적)\s*(?:는|은|이|가)?\s*[가-힣]+/g,
    message: "고향 또는 출신지 표기는 블라인드 규정상 금지됩니다.",
  },

  // 5. 나이, 성별, 병역
  {
    category: "age_gender",
    categoryLabel: "성별 표현",
    regex: /(?:남성|여성|남자|여자)으로서(?![가-힣])/g,
    message: "성별을 전면에 드러내는 서술은 지양해야 합니다.",
  },
  {
    category: "age_gender",
    categoryLabel: "나이 표현",
    regex: /(?:\b\d{2}세|\b\d{2}살)\s*(?:청년|나이|청춘|남성|여성|지원자)?/g,
    message: "구체적인 나이 언급은 연령 블라인드 위반 대상입니다.",
  },
  {
    category: "age_gender",
    categoryLabel: "병역 사항",
    regex: /(?:군필|미필|병역필|병역면제)(?![가-힣])/g,
    message: "병역사항(군필/미필 등)의 본문 직접 기재는 블라인드 감점 대상입니다.",
  },
];

/**
 * 텍스트에서 블라인드 채용 위반 항목을 규칙 기반으로 전수 탐지
 */
export function detectBlindViolations(text: string): BlindCheckResult {
  if (typeof text !== "string" || !text.trim()) {
    return { clean: true, totalViolations: 0, violations: [] };
  }

  const violations: BlindViolation[] = [];
  const seenMatches = new Set<string>();

  for (const rule of BLIND_RULES) {
    const rx = new RegExp(rule.regex.source, rule.regex.flags);
    let match: RegExpExecArray | null;
    while ((match = rx.exec(text)) !== null) {
      const matchedText = match[0].trim();
      const key = `${rule.category}:${match.index}:${matchedText}`;
      if (!seenMatches.has(key)) {
        seenMatches.add(key);
        violations.push({
          category: rule.category,
          categoryLabel: rule.categoryLabel,
          matchedText,
          index: match.index,
          message: rule.message,
        });
      }
    }
  }

  // index 기준 오름차순 정렬
  violations.sort((a, b) => a.index - b.index);

  return {
    clean: violations.length === 0,
    totalViolations: violations.length,
    violations,
  };
}
