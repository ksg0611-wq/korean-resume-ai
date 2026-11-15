# P1.4 결제 전환 구조 개편 — 검증 및 런칭 리포트

- **대상 브랜치**: `main`
- **최종 빌드 검증**: `npx tsc --noEmit` (Exit 0), `npm run build` (Exit 0, Next.js 14.2.3)
- **검증 환경 경계(Scope & Boundary)**:
  - 오프라인 규칙·루브릭 단위 테스트(`test-blind-and-rubric.mjs` via `npx jiti`): 실제 `textMetrics.ts`, `blindCheck.ts`, `diagnoseRubric.ts` 모듈 직접 실행
  - 라이브 API 통합 테스트(`verify-p1-4-live.mjs`): 로컬 Next.js/라우트 핸들러 + **로컬 Upstash REST 목업(`127.0.0.1:4199`)** + **실제 Google Gemini API(`gemini-3.8-flash`)** 호출
  - 부분 실패 테스트(`CHECK 5`): `generateTenInterviewQuestions` 단계에서 Gemini `503` 오류를 시뮬레이션(`Simulated Gemini 503 failure on interview 10 questions`)한 뒤 `/api/interview/retry`로 실제 Gemini 10문항 복구 검증
  - ※ 프로덕션 Redis/DB 조작, 디버그 엔드포인트 배포 및 API 키·접속 정보 출력 없음

---

## 1. 커밋 구성 및 구현 요약

| 커밋 해시 | 커밋 메시지 | 핵심 변경 내용 |
| :--- | :--- | :--- |
| `242f5b7` | `feat(p1.4): text metrics, blind check utils, and diagnostic scoring rubric` | 글자수·2B바이트·수치 토큰 카운터(`textMetrics.ts`), 문맥 기반 블라인드 위반 탐지(`blindCheck.ts`), 5개 영역(100점) 채점 루브릭 및 무료 응답 필터(`diagnoseRubric.ts`) |
| `c0e9d2e` | `feat(p1.4): diagnosis API, 4-question draft generation, previewToken unlock and partial-failure retry` | `POST /api/diagnose`, 4문항 일괄 생성(`mode: "draft"`, Q2~Q4 서버 본문 제거), `previewToken` 7,200초 TTL·사전 매핑(`POST /api/payments/prepare`)·1회성 소진(`CONSUME_PREVIEW_LUA`), Branch A 자소서 잠금해제 + 면접 부분 실패 시 비환불·무차감 재시도(`POST /api/interview/retry`) |
| `d187c29` | `feat(p1.4): 2-mode home UI, comparison table, preview unlock & recovery flow` | 홈 2모드 UI(`이미 쓴 자소서 진단받기` / `메모로 새로 쓰기`), `DiagnosisReportView`, `PackageComparisonTable` 결제 버튼 직상단 배치, `localStorage` 원문 복구 UI(`DIAGNOSIS_TEXT_MISSING` 대응), `/result/[orderId]` 4문항·10질문 탭 및 재시도 UI |
| `c9780ce` | `feat(p1.4): sample showcase page, job D-day CTA badge, and policy updates` | `/sample` 가상 지원자 완성본 예시 페이지(`sitemap.ts` 포함), `/jobs/[sn]` 마감 D-day CTA 배지, `/privacy`(7,200초 미리보기 파기)·`/refund`(부분 실패 예외)·`FAQAccordion.tsx` 문구 동기화 |
| `30c24c8` | `fix(p1.4): enforce rubric repeatability, prevent blind leaks, and speed up interview generation` | `temperature: 0` 및 `alignment`(`jobFit`+`questionFocus`) 2점 단위 세부 앵커 적용으로 3회 반복 편차 최소화(7점 → 2점), AI 약점/수정예시 내 블라인드 단어 유출 차단 필터 보강, 10문항 면접 생성 속도/타임아웃 안정화 |

---

## 2. 무료 자소서 진단(`POST /api/diagnose`) 서버 레벨 차단 RAW 검증

샘플 1(`1. 부실 초안 (블라인드 위반+추상)`, 156자, 블라인드 위반 2건 포함) 호출 결과입니다.  
- `topWeaknesses` 2건만 `description` 포함, 나머지 `lockedWeaknesses` 4건은 `id`·`categoryKey`·`title`·`severity`·`isLocked: true`만 반환(`description` 미포함).
- `blindSummary`는 `{ "clean": false, "totalViolations": 2, "isLocked": true }`만 반환하며, 위반 단어·인덱스·수정 위치는 네트워크 JSON에 포함되지 않음 (`topWeaknesses` 및 `sampleFix`에서도 대학명·가족직업 등 블라인드 키워드 노출 0건 확인).

```json
{
  "isFree": true,
  "totalScore": 24,
  "grade": "D",
  "summary": "핵심 과제와 본인 역할이 모호하고 분량·형식 조정이 시급하여 전면 재구조화가 필요합니다.",
  "categories": [
    {
      "key": "star",
      "name": "STAR 프레임워크",
      "score": 5,
      "maxScore": 25,
      "label": "개선 필요"
    },
    {
      "key": "metrics_role",
      "name": "수치·역할 구체성",
      "score": 5,
      "maxScore": 25,
      "label": "개선 필요"
    },
    {
      "key": "alignment",
      "name": "직무/문항 적합성",
      "score": 6,
      "maxScore": 20,
      "label": "개선 필요"
    },
    {
      "key": "blind",
      "name": "블라인드 규정 준수",
      "score": 4,
      "maxScore": 15,
      "label": "위험"
    },
    {
      "key": "length",
      "name": "글자수/분량 적정성",
      "score": 4,
      "maxScore": 15,
      "label": "심각"
    }
  ],
  "metrics": {
    "charCount": 156,
    "charCountNoSpaces": 125,
    "byteCount2B": 276,
    "targetChars": 500,
    "fillRatio": 0.312,
    "metricCount": 0
  },
  "blindSummary": {
    "clean": false,
    "totalViolations": 2,
    "isLocked": true
  },
  "totalWeaknessCount": 6,
  "topWeaknesses": [
    {
      "id": "wk-blind",
      "categoryKey": "blind",
      "title": "블라인드 채용 위반 의심 표현 2건 발견",
      "severity": "high",
      "description": "규정 위반 의심 표현이 포함되어 있어 서류 전형 감점 또는 결격 사유가 될 수 있습니다. 정확한 위반 위치와 대체 표현은 완성본에서 안전하게 교정됩니다."
    },
    {
      "id": "wk-1",
      "categoryKey": "questionFocus",
      "title": "문항 요구 사항(문제 해결 경험) 미작성",
      "severity": "high",
      "description": "문항은 직무 수행 중 문제를 해결한 경험과 본인의 역할을 요구하고 있으나, 어떠한 문제도 제시되지 않은 채 일상적인 팀 프로젝트 참여 사실만 언급되었습니다."
    }
  ],
  "lockedWeaknesses": [
    {
      "id": "wk-2",
      "categoryKey": "roleScore",
      "title": "본인 고유 기여도 및 구체적 역할 결여",
      "severity": "high",
      "isLocked": true
    },
    {
      "id": "wk-3",
      "categoryKey": "specificityScore",
      "title": "객관적 성과 근거 및 정량적 지표 부재",
      "severity": "high",
      "isLocked": true
    },
    {
      "id": "wk-4",
      "categoryKey": "jobFit",
      "title": "일반행정 직무 전문성 및 연계성 부족",
      "severity": "medium",
      "isLocked": true
    },
    {
      "id": "wk-length",
      "categoryKey": "length",
      "title": "목표 분량 대비 글자수 부적합 (156자 / 목표 500자)",
      "severity": "medium",
      "isLocked": true
    }
  ],
  "sampleFix": {
    "title": "추상적 참여 서술을 구체적 문제 해결 및 역할 중심으로 재구성",
    "beforeExcerpt": "팀 프로젝트를 하면서 열심히 참여했고 좋은 결과를 얻어 보람을 느꼈습니다.",
    "afterExample": "[프로젝트 주제] 수행 중 [발생한 문제 상황]으로 인해 일정 지연 위기가 발생했습니다. 저는 행정 담당자로서 [해결 대안 도출 및 조율 행동]을 실행하여 병목 구간을 해소했습니다. 그 결과 마감 기한을 [본인 수치 입력]일 단축하며 [본인 수치 입력] 수준의 평가를 달성했습니다.",
    "tip": "'열심히 참여했다'는 수동적 표현 대신, 구체적인 문제 상황을 명시하고 본인이 주도한 역할과 실행 단계, 그리고 전후 비교 수치를 명확히 제시해야 설득력이 생깁니다."
  },
  "usedModel": "gemini-3.8-flash",
  "durationMs": 10779
}
```

---

## 3. 무료 전 문항 생성(`mode: "draft"`) 부분 공개 RAW 검증

- **모델/품질 통일**: `usedModel: "gemini-3.8-flash"`, `thinkingLevel: "medium"`, `attempts: 1`
- **소요 시간**: `durationMs: 23234` (엔드포인트 전체 `23241ms`, 30초 제한 이내 통과)
- **서버 본문 차단**: `items`에는 1번 문항(`q1`, 482자) 본문만 포함되며, `lockedItems`의 2~4번 문항(`q2` 498자, `q3` 508자, `q4` 499자)은 `body` 필드가 완전히 제거되어 반환됨.

```json
{
  "success": true,
  "mode": "draft",
  "isFree": true,
  "previewToken": "oo0ptTvczc6qzrJPy9AGUaffnHRAbnC0",
  "previewExpiresAt": "2026-11-15T14:31:20.645Z",
  "text": "[체계적인 행정 관리로 신뢰받는 공공 서비스를 뒷받침하겠습니다] 공공기관의 지속 가능한 발전과 공공성 확보는 투명하고 빈틈없는 행정 지원에서 시작된다고 확신합니다. 총무 인턴으로 근무하며 조직의 혈맥과도 같은 회계 및 사무 행정의 중요성을 체감했고, 국민을 위한 공공 가치를 실현하는 데 이바지하고자 일반행정 직무에 지원했습니다. 인턴 기간 동안 각종 지출 서류 검토와 민원 서류 발급 등 기본 사무를 성실히 수행하며, 정확한 규정 준수와 신속한 업무 처리가 조직 전체의 대외 신뢰도로 직결됨을 배웠습니다. 귀 기관은 공공 서비스의 질적 향상과 투명한 조직 운영을 최우선 가치로 삼고 있습니다. 이러한 기관의 방향성에 발맞추어, 철저한 내부 규정 준수와 꼼꼼한 지출 및 자원 관리를 실천하는 행정 전문가가 되겠습니다. 공공의 이익을 최우선으로 생각하는 책임감 있는 자세로 업무에 임하여, 기관의 사업들이 차질 없이 추진될 수 있도록 든든한 기반을 마련하겠습니다.",
  "items": [
    {
      "id": "q1",
      "order": 1,
      "title": "1. 지원동기 및 기관 이해",
      "body": "[체계적인 행정 관리로 신뢰받는 공공 서비스를 뒷받침하겠습니다] 공공기관의 지속 가능한 발전과 공공성 확보는 투명하고 빈틈없는 행정 지원에서 시작된다고 확신합니다. 총무 인턴으로 근무하며 조직의 혈맥과도 같은 회계 및 사무 행정의 중요성을 체감했고, 국민을 위한 공공 가치를 실현하는 데 이바지하고자 일반행정 직무에 지원했습니다. 인턴 기간 동안 각종 지출 서류 검토와 민원 서류 발급 등 기본 사무를 성실히 수행하며, 정확한 규정 준수와 신속한 업무 처리가 조직 전체의 대외 신뢰도로 직결됨을 배웠습니다. 귀 기관은 공공 서비스의 질적 향상과 투명한 조직 운영을 최우선 가치로 삼고 있습니다. 이러한 기관의 방향성에 발맞추어, 철저한 내부 규정 준수와 꼼꼼한 지출 및 자원 관리를 실천하는 행정 전문가가 되겠습니다. 공공의 이익을 최우선으로 생각하는 책임감 있는 자세로 업무에 임하여, 기관의 사업들이 차질 없이 추진될 수 있도록 든든한 기반을 마련하겠습니다.",
      "charCount": 482,
      "byteCount": 836
    }
  ],
  "lockedItems": [
    {
      "id": "q2",
      "order": 2,
      "title": "2. 직무역량 및 문제해결 경험",
      "targetChars": 500,
      "charCount": 498,
      "byteCount": 859,
      "isLocked": true
    },
    {
      "id": "q3",
      "order": 3,
      "title": "3. 협업·갈등 해결 경험",
      "targetChars": 500,
      "charCount": 508,
      "byteCount": 869,
      "isLocked": true
    },
    {
      "id": "q4",
      "order": 4,
      "title": "4. 입사 후 포부 및 발전 계획",
      "targetChars": 500,
      "charCount": 499,
      "byteCount": 865,
      "isLocked": true
    }
  ],
  "usedModel": "gemini-3.8-flash",
  "thinkingLevel": "medium",
  "attempts": 1,
  "durationMs": 23234,
  "usage": {
    "promptTokens": 574,
    "completionTokens": 1279,
    "thinkingTokens": 1479,
    "totalTokens": 3332
  }
}
```

---

## 4. 진단 루브릭 일관성(3회 반복) · 5종 캘리브레이션 · 블라인드 오탐 검증

### 4-1. 동일 자소서 3회 연속 호출 반복성 (`±5점` 기준 → 실제 편차 `2점`)

```json
{
  "repeatRuns": [
    {
      "run": 1,
      "totalScore": 68,
      "grade": "B",
      "categories": "star:19,metrics_role:13,alignment:14,blind:15,length:7"
    },
    {
      "run": 2,
      "totalScore": 70,
      "grade": "B",
      "categories": "star:19,metrics_role:15,alignment:14,blind:15,length:7"
    },
    {
      "run": 3,
      "totalScore": 68,
      "grade": "B",
      "categories": "star:19,metrics_role:13,alignment:14,blind:15,length:7"
    }
  ],
  "spread": 2
}
```

### 4-2. 5종 현실 샘플 라이브 채점 분포

| 샘플 | 글자수 | 총점 (등급) | 세부 영역 점수 | 블라인드 위반 | 잠금 약점 수 |
| :--- | :---: | :---: | :--- | :---: | :---: |
| 1. 부실 초안 (블라인드 위반+추상) | 156자 | **24점 (D)** | STAR=5/25 \| 수치·역할=5/25 \| 적합성=6/20 \| 블라인드=4/15 \| 글자수=4/15 | 2건 | 4건 |
| 2. 평범 취준생 A (경험 있으나 수치 없음) | 344자 | **66점 (B)** | STAR=17/25 \| 수치·역할=9/25 \| 적합성=14/20 \| 블라인드=15/15 \| 글자수=11/15 | 0건 | 2건 |
| 3. 평범 취준생 B (인턴 경험, 수치 1건) | 321자 | **70점 (B)** | STAR=19/25 \| 수치·역할=15/25 \| 적합성=14/20 \| 블라인드=15/15 \| 글자수=7/15 | 0건 | 3건 |
| 4. 평균-양호 취준생 (인턴+수치 다수+역할 구체) | 350자 | **92점 (S)** | STAR=23/25 \| 수치·역할=25/25 \| 적합성=18/20 \| 블라인드=15/15 \| 글자수=11/15 | 0건 | 2건 |
| 5. 고완성도 합격권 (STAR+수치+고유역할+블라인드 준수) | 364자 | **96점 (S)** | STAR=25/25 \| 수치·역할=25/25 \| 적합성=20/20 \| 블라인드=15/15 \| 글자수=11/15 | 0건 | 2건 |

*(참고: 오프라인 고정 앵커 단위 테스트 `test-blind-and-rubric.mjs` 5종 분포: `[1] 64점(C)`, `[2] 44점(D)`, `[3] 91점(S)`, `[4] 65점(B)`, `[5] 58점(C)`)*

### 4-3. 블라인드 위반 탐지 정확도 (`20 위반 + 20 정상` 데이터셋, 최종 수정 후 재실행)

- **위반 문장 20건 탐지**: `20 / 20` (100% 탐지)
- **정상 문장 20건 오탐**: `0 / 20` (허용 기준 `<= 1건` 충족)

| 구분 | 검증 문장 요약 (각 20문장) | 판정 결과 |
| :--- | :--- | :---: |
| 위반 #1~#8 (대학명) | `한국대학교`, `서울대학교`, `연세대학교`, `고려대학교`, `부산대 졸업`, `경북대 재학`, `전남대 출신`, `한양대 에리카` | **8 / 8 탐지** |
| 위반 #9~#12 (고교·학점) | `대원외고`, `서울과학고등학교`, `학점 4.2점`, `전체 평점 3.8/4.5` | **4 / 4 탐지** |
| 위반 #13~#15 (가족 직업) | `아버지는 시청 공무원`, `어머니께서 운영하시는 세무사`, `부모님의 회사` | **3 / 3 탐지** |
| 위반 #16~#20 (출신지·연령·연락처) | `서울에서 태어나`, `부산 해운대구에서 나고 자란`, `28세 청년`, `20대 남성...병역필`, `010-1234-5678 / test@gmail.com` | **5 / 5 탐지** |
| 정상 #1~#20 (`대` 포함 정상 어휘 등) | `대응`, `20대 취업준비생`, `대인관계`, `기대 이상`, `최대의 효율`, `대규모`, `시대`, `대다수`, `대표적인`, `대외활동`, `현대자동차`, `대한민국`, `대안`, `대립`, `대대적`, `대시보드`, `대국적`, `대변`, `대체`, `대조` 포함 정상 문장 20건 | **0 / 20 오탐** |

---

## 5. `previewToken` 잠금 해제(Branch A) 및 면접 부분 실패 무차감 재시도 검증

### 5-1. `orderId <-> previewToken` 사전 매핑, 7,200초 TTL 및 Branch A 1회성 소진 (`remainingGenerations: 2`)

```json
{
  "prepareMapping": {
    "linked": true,
    "previewExists": true,
    "expiresAt": "2026-11-15T14:31:20.652Z"
  },
  "previewTtlBeforeUnlockSec": 7200,
  "unlockSummary": {
    "branch": "preview_unlock",
    "usedModel": "gemini-3.8-flash",
    "unlockedItemsCount": 4,
    "interviewQuestionsCount": 10,
    "usedCount": 1,
    "remainingGenerations": 2,
    "previewExistsAfterConsume": 0
  },
  "resultEndpointStatus": 200,
  "resultRemainingGenerations": 2
}
```

### 5-2. 면접 10문항 부분 실패 시 비환불 예외 및 `/api/interview/retry` 무차감 복구

- 자소서 4문항 잠금 해제 후 면접 10문항 생성이 실패(폴백 모델 1회 재시도 포함)하면 전액 자동 환불을 실행하지 않고(`orderStatus: "done"`, `refundedAt: null`), `interviewPending: true` 상태와 함께 `usedCount: 1`, `remainingGenerations: 2`를 유지합니다.
- 이어서 `POST /api/interview/retry` 호출 시 10문항이 정상 생성(`interviewPending: false`, `interviewQuestionsCount: 10`)되며 추가 횟수 차감 없이(`usedCountAfterRetry: 1`, `remainingGenerationsAfterRetry: 2`) 완료됩니다.

```json
{
  "partialFailureResponse": {
    "httpStatus": 200,
    "branch": "preview_unlock",
    "partialFailure": true,
    "interviewPending": true,
    "unlockedItemsCount": 4,
    "interviewQuestionsCount": 0,
    "orderStatus": "done",
    "refundedAt": null,
    "usedCount": 1,
    "remainingGenerations": 2
  },
  "retryResponse": {
    "httpStatus": 200,
    "interviewPending": false,
    "interviewQuestionsCount": 10,
    "usedModel": "gemini-3.8-flash",
    "usedCountAfterRetry": 1,
    "remainingGenerationsAfterRetry": 2
  }
}
```
