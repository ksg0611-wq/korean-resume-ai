# P1.4 결제 전환 구조 개편 — 검증 및 런칭 리포트

- **대상 브랜치**: `main`
- **최종 빌드 검증**: `npx tsc --noEmit` (Exit 0), `npm run build` (Exit 0, Next.js 14.2.3)
- **검증 환경 경계(Scope & Boundary)**:
  - 오프라인 규칙·루브릭·수치 날조 차단 단위 테스트(`test-blind-and-rubric.mjs` via `npx jiti`): 실제 `textMetrics.ts`, `blindCheck.ts`, `diagnoseRubric.ts`, `sampleData.ts` 모듈 직접 실행
  - 라이브 API 통합 테스트(`verify-p1-4-live.mjs`): 로컬 Next.js/라우트 핸들러 + **로컬 Upstash REST 목업(`127.0.0.1:4199`, `EVAL`/`INCR`/`DECR` Lua 에뮬레이션 포함)** + **실제 Google Gemini API(`gemini-3.8-flash`)** 호출
  - 부분 실패 테스트(`CHECK 5`): `generateTenInterviewQuestions` 단계에서 Gemini `503` 오류를 시뮬레이션(`Simulated Gemini 503 failure on interview 10 questions`)한 뒤 `/api/interview/retry`로 실제 Gemini 10문항 복구 검증
  - 강제 실패 무료 크레딧 복구 테스트(`CHECK 7`): `generativelanguage.googleapis.com` `fetch` 장애 시뮬레이션(`Simulated Gemini 503 outage`)으로 `/api/diagnose`, `/api/generate(isFree: true)`, `/api/interview/generate(isFree: true)` 3개 엔드포인트 모두 무료 횟수가 복원됨을 검증
  - ※ 프로덕션 Redis/DB 조작, 디버그 엔드포인트 배포 및 API 키·접속 정보 출력 없음

---

## 1. 기본 P1.4 구현 커밋 요약 및 후속 보완 항목

| 커밋 해시 | 커밋 메시지 | 핵심 변경 내용 |
| :--- | :--- | :--- |
| `242f5b7` | `feat(p1.4): text metrics, blind check utils, and diagnostic scoring rubric` | 글자수·2B바이트·수치 토큰 카운터(`textMetrics.ts`), 문맥 기반 블라인드 위반 탐지(`blindCheck.ts`), 5개 영역(100점) 채점 루브릭 및 무료 응답 필터(`diagnoseRubric.ts`) |
| `c0e9d2e` | `feat(p1.4): diagnosis API, 4-question draft generation, previewToken unlock and partial-failure retry` | `POST /api/diagnose`, 4문항 일괄 생성(`mode: "draft"`, Q2~Q4 서버 본문 제거), `previewToken` 7,200초 TTL·사전 매핑(`POST /api/payments/prepare`)·1회성 소진(`CONSUME_PREVIEW_LUA`), Branch A 자소서 잠금해제 + 면접 부분 실패 시 비환불·무차감 재시도(`POST /api/interview/retry`) |
| `d187c29` | `feat(p1.4): 2-mode home UI, comparison table, preview unlock & recovery flow` | 홈 2모드 UI(`이미 쓴 자소서 진단받기` / `메모로 새로 쓰기`), `DiagnosisReportView`, `PackageComparisonTable` 결제 버튼 직상단 배치, `localStorage` 원문 복구 UI(`DIAGNOSIS_TEXT_MISSING` 대응), `/result/[orderId]` 4문항·10질문 탭 및 재시도 UI |
| `c9780ce` | `feat(p1.4): sample showcase page, job D-day CTA badge, and policy updates` | `/sample` 가상 지원자 완성본 예시 페이지(`sitemap.ts` 포함), `/jobs/[sn]` 마감 D-day CTA 배지, `/privacy`(7,200초 미리보기 파기)·`/refund`(부분 실패 예외)·`FAQAccordion.tsx` 문구 동기화 |
| `30c24c8` | `fix(p1.4): enforce rubric repeatability, prevent blind leaks, and speed up interview generation` | `temperature: 0` 및 `alignment`(`jobFit`+`questionFocus`) 2점 단위 세부 앵커 적용으로 3회 반복 편차 최소화(`2점`), AI 약점/수정예시 내 블라인드 단어 유출 차단 필터 보강, 10문항 면접 생성 속도/타임아웃 안정화 |
| `84bccae` | `chore(seo): add naver-site-verification meta tag` | `src/app/layout.tsx` `metadata.verification.other["naver-site-verification"]` 메타태그 반영 (`db2fc7347a4bd68976c437508b13bbd79e4dbc16`) |
| `7058c6d` | `fix(p1.4): enforce anti-fabrication sanitizer, 50s timeout budget, and free quota refund on failure` | 수치 날조 후처리 차단기(`sanitizeUnverifiedNumbers`) 및 생성·진단 프롬프트 전면 적용, `30s+20s=50s` 시간 예산 구조화, 무료 3종 엔드포인트 실패 시 Lua 기반 크레딧 즉시 복구(`reserveFreeRateLimit`) |
| `cefb1ef` | `fix(p1.4): remove unverified sample metrics, real org names, and pass-guarantee wording` | `/sample` 실제 기관명(`한국도로공사` → `OO공사`) 및 미검증 수치 제거, 히어로 미리보기 카드 플레이스홀더화, 서비스·블로그 전역 `'합격'` 표현 제거 |
| `c0fab6e` | `chore(p1.4): unify Korea Resume AI branding, refund copy, and 3-generation breakdown` | `Korea Resume AI` 브랜드명 통일, 환불 정책 요약(`최초 생성 실패 시 자동 전액 환불, 면접 질문만 실패 시 무료 재시도`) 및 `총 3회(미리보기 해제 1회 + 재생성 2회)` 문구 통일, `1문항 무료 미리보기` 배지 명시 |

---

## 2. 무료 자소서 진단(`POST /api/diagnose`) 서버 레벨 차단 RAW 검증

샘플 1(`1. 부실 초안 (블라인드 위반+추상)`, 156자, 블라인드 위반 2건 포함) 호출 결과입니다.  
- `topWeaknesses` 2건만 `description` 포함, 나머지 `lockedWeaknesses` 4건은 `id`·`categoryKey`·`title`·`severity`·`isLocked: true`만 반환(`description` 미포함).
- `blindSummary`는 `{ "clean": false, "totalViolations": 2, "isLocked": true }`만 반환하며, 위반 단어·인덱스·수정 위치는 네트워크 JSON에 포함되지 않음 (`topWeaknesses` 및 `sampleFix`에서도 대학명·가족직업 등 블라인드 키워드 노출 0건 + 미검증 수치 `[본인 수치 입력]` 치환 확인).

```json
{
  "isFree": true,
  "totalScore": 28,
  "grade": "D",
  "summary": "핵심 과제와 본인 역할이 모호하고 분량·형식 조정이 시급하여 전면 재구조화가 필요합니다.",
  "categories": [
    { "key": "star", "name": "STAR 프레임워크", "score": 9, "maxScore": 25, "label": "개선 필요" },
    { "key": "metrics_role", "name": "수치·역할 구체성", "score": 5, "maxScore": 25, "label": "개선 필요" },
    { "key": "alignment", "name": "직무/문항 적합성", "score": 6, "maxScore": 20, "label": "개선 필요" },
    { "key": "blind", "name": "블라인드 규정 준수", "score": 4, "maxScore": 15, "label": "위험" },
    { "key": "length", "name": "글자수/분량 적정성", "score": 4, "maxScore": 15, "label": "심각" }
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
      "title": "문항 핵심 질문 응답 누락",
      "severity": "high",
      "description": "문항은 '문제를 해결한 경험과 본인 역할'을 요구하고 있으나, 어떤 문제를 마주했고 어떻게 해결했는지에 대한 구체적 내용이 전혀 기술되지 않았습니다."
    }
  ],
  "lockedWeaknesses": [
    { "id": "wk-2", "categoryKey": "starStructure", "title": "STAR 문제 해결 구조 결여", "severity": "high", "isLocked": true },
    { "id": "wk-3", "categoryKey": "metricsRole", "title": "수치적 근거 및 본인 고유 역할 부재", "severity": "high", "isLocked": true },
    { "id": "wk-4", "categoryKey": "jobFit", "title": "행정 직무 역량 연계성 부족", "severity": "medium", "isLocked": true },
    { "id": "wk-length", "categoryKey": "length", "title": "목표 분량 대비 글자수 부적합 (156자 / 목표 500자)", "severity": "medium", "isLocked": true }
  ],
  "sampleFix": {
    "title": "행동 및 결과의 구체적 기술로 수정",
    "beforeExcerpt": "팀 프로젝트를 하면서 열심히 참여했고 좋은 결과를 얻어 보람을 느꼈습니다.",
    "afterExample": "행정 사무 관련 프로젝트 진행 중 일정 지연 문제가 발생했을 때, 저는 업무 분장표를 재수립하고 일정 관리 템플릿을 도입하여 진척도를 일 단위로 관리했습니다. 그 결과 마감 기한보다 [본인 수치 입력]일 앞당겨 과업을 완수하며 프로젝트 만족도 [본인 수치 입력]점을 달성했습니다.",
    "tip": "단순히 '열심히 했다'는 서술 대신, 발생한 문제(일정 지연, 데이터 불일치 등), 본인이 직접 도입한 해결 방식, 그리고 그로 인해 달성한 정량적 성과를 명확히 작성하세요."
  },
  "freeRemaining": 1,
  "usedModel": "gemini-3.8-flash",
  "durationMs": 8631
}
```

---

## 3. 무료 전 문항 생성(`mode: "draft"`) 부분 공개 RAW 검증

- **모델/품질 통일**: `usedModel: "gemini-3.8-flash"`, `thinkingLevel: "medium"`, `attempts: 1`
- **소요 시간**: `durationMs: 12369` (엔드포인트 전체 `12375ms`, 30초 1차 예산 이내 통과)
- **서버 본문 차단 및 미검증 수치 0건**: `items`에는 1번 문항(`q1`, 431자) 본문만 포함되며, `lockedItems`의 2~4번 문항(`q2` 439자, `q3` 439자, `q4` 434자)은 `body` 필드가 완전히 제거되어 반환됨. 생성 본문 내 입력 외 수치 `0건` 검증.

```json
{
  "success": true,
  "mode": "draft",
  "isFree": true,
  "freeRemaining": 1,
  "previewToken": "0ifHVzMYiyapT8Fg7o-N2q3G4gkuqCxK",
  "previewExpiresAt": "2026-11-15T15:01:37.104Z",
  "text": "[투명하고 정확한 행정으로 공공의 신뢰를 구축하겠습니다]\n공공기관의 일반행정 직무는 기관의 예산 집행과 행정 지원의 투명성을 담보하여 대국민 신뢰를 형성하는 핵심적인 기초입니다. 저는 총무 인턴으로 근무하며 정산 관리와 민원 행정 업무를 수행하였고, 철저한 기준 준수와 정확한 사무 처리가 조직의 원활한 운영을 뒷받침하는 핵심 가치임을 체감하였습니다. 공공의 이익을 최우선으로 두는 귀 기관에서 경영·회계 지원 체계를 고도화하고 내실 있는 행정 서비스를 제공하고자 지원하였습니다. 입사 후 귀 기관의 사업 운영 방향과 행정 규정을 신속히 숙지하고, 예산 정산 및 회계 관리 프로세스를 꼼꼼하게 점검하겠습니다. 아울러 대내외 민원 서류 처리와 행정 협업 전반에서 공정성과 투명성을 지키며, 기관 구성원과 국민 모두가 신뢰할 수 있는 든든한 행정 전문가로 자리매김하겠습니다.",
  "items": [
    {
      "id": "q1",
      "order": 1,
      "title": "1. 지원동기 및 기관 이해",
      "body": "[투명하고 정확한 행정으로 공공의 신뢰를 구축하겠습니다]\n공공기관의 일반행정 직무는 기관의 예산 집행과 행정 지원의 투명성을 담보하여 대국민 신뢰를 형성하는 핵심적인 기초입니다. 저는 총무 인턴으로 근무하며 정산 관리와 민원 행정 업무를 수행하였고, 철저한 기준 준수와 정확한 사무 처리가 조직의 원활한 운영을 뒷받침하는 핵심 가치임을 체감하였습니다. 공공의 이익을 최우선으로 두는 귀 기관에서 경영·회계 지원 체계를 고도화하고 내실 있는 행정 서비스를 제공하고자 지원하였습니다. 입사 후 귀 기관의 사업 운영 방향과 행정 규정을 신속히 숙지하고, 예산 정산 및 회계 관리 프로세스를 꼼꼼하게 점검하겠습니다. 아울러 대내외 민원 서류 처리와 행정 협업 전반에서 공정성과 투명성을 지키며, 기관 구성원과 국민 모두가 신뢰할 수 있는 든든한 행정 전문가로 자리매김하겠습니다.",
      "charCount": 431,
      "byteCount": 752
    }
  ],
  "lockedItems": [
    { "id": "q2", "order": 2, "title": "2. 직무역량 및 문제해결 경험", "targetChars": 500, "charCount": 439, "byteCount": 755, "isLocked": true },
    { "id": "q3", "order": 3, "title": "3. 협업·갈등 해결 경험", "targetChars": 500, "charCount": 439, "byteCount": 758, "isLocked": true },
    { "id": "q4", "order": 4, "title": "4. 입사 후 포부 및 발전 계획", "targetChars": 500, "charCount": 434, "byteCount": 754, "isLocked": true }
  ],
  "usedModel": "gemini-3.8-flash",
  "thinkingLevel": "medium",
  "attempts": 1,
  "durationMs": 12369,
  "usage": {
    "promptTokens": 603,
    "completionTokens": 1163,
    "thinkingTokens": 0,
    "totalTokens": 1766
  }
}
```

---

## 4. 진단 루브릭 일관성(3회 반복) · 5종 캘리브레이션 · 블라인드 오탐 검증

### 4-1. 동일 자소서 3회 연속 호출 반복성 (`±5점` 기준 → 실제 편차 `2점`)

```json
{
  "repeatRuns": [
    { "run": 1, "totalScore": 68, "grade": "B", "categories": "star:19,metrics_role:13,alignment:14,blind:15,length:7" },
    { "run": 2, "totalScore": 70, "grade": "B", "categories": "star:19,metrics_role:15,alignment:14,blind:15,length:7" },
    { "run": 3, "totalScore": 70, "grade": "B", "categories": "star:19,metrics_role:15,alignment:14,blind:15,length:7" }
  ],
  "spread": 2
}
```

### 4-2. 5종 현실 샘플 라이브 채점 분포

| 샘플 | 글자수 | 총점 (등급) | 세부 영역 점수 | 블라인드 위반 | 잠금 약점 수 |
| :--- | :---: | :---: | :--- | :---: | :---: |
| 1. 부실 초안 (블라인드 위반+추상) | 156자 | **28점 (D)** | STAR=9/25 \| 수치·역할=5/25 \| 적합성=6/20 \| 블라인드=4/15 \| 글자수=4/15 | 2건 | 4건 |
| 2. 평범 취준생 A (경험 있으나 수치 없음) | 344자 | **66점 (B)** | STAR=17/25 \| 수치·역할=9/25 \| 적합성=14/20 \| 블라인드=15/15 \| 글자수=11/15 | 0건 | 2건 |
| 3. 평범 취준생 B (인턴 경험, 수치 1건) | 321자 | **68점 (B)** | STAR=19/25 \| 수치·역할=13/25 \| 적합성=14/20 \| 블라인드=15/15 \| 글자수=7/15 | 0건 | 3건 |
| 4. 평균-양호 취준생 (인턴+수치 다수+역할 구체) | 350자 | **92점 (S)** | STAR=23/25 \| 수치·역할=25/25 \| 적합성=18/20 \| 블라인드=15/15 \| 글자수=11/15 | 0건 | 2건 |
| 5. 고완성도 초안 (STAR+수치+고유역할+블라인드 준수) | 364자 | **96점 (S)** | STAR=25/25 \| 수치·역할=25/25 \| 적합성=20/20 \| 블라인드=15/15 \| 글자수=11/15 | 0건 | 2건 |

*(참고: 오프라인 고정 앵커 단위 테스트 `test-blind-and-rubric.mjs` 5종 분포: `[1] 64점(C)`, `[2] 44점(D)`, `[3] 91점(S)`, `[4] 65점(B)`, `[5] 58점(C)`)*

### 4-3. 블라인드 위반 탐지 정확도 (`20 위반 + 20 정상` 데이터셋)

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
    "expiresAt": "2026-11-15T15:01:37.113Z"
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

---

## 6. 1차 검수 후속 보완 6건 + 네이버 서치어드바이저 검증 결과

### 6-1. 수치 날조 전면 차단 (샘플 + 프롬프트 + 후처리 검사기 자동 테스트)

- `src/lib/textMetrics.ts`에 `UNVERIFIED_QUANT_REGEX`, `findUnverifiedMetrics`, `sanitizeUnverifiedNumbers` 추가:
  - 지원자 입력 원문에 존재하지 않는 성과·정량 수치(`%`, `%p`, `퍼센트`, `원`, `천/만/억/조`, `건`, `명`, `배`, `시간`, 단독 `Zero`/`제로`)가 AI 생성 본문 또는 진단 `sampleFix.afterExample`에 포함되면 즉시 `[본인 수치 입력]`으로 자동 치환.
  - `"3가지"`, `"2단계"`, `"1번"`, `"4문항"`, `"5급"`, `"2026년"` 등 일반 문장 구조 숫자와 `"실제로"`, `"문제로"`, `"제로베이스"` 등 한글 단어 내부 문자열은 오탐하지 않도록 설계.
- **자동 테스트 실행 결과 (`npx jiti test-blind-and-rubric.mjs` Section 4)**:
  - 입력 원문(`"총무 인턴 6개월 경험. 팀원 4명과 함께 예산 3,000만 원을 관리하며 월별 지출 정산 시트를 개선했고 오류 감소율 15%를 확인했습니다."`) 대비:
    - 원문 일치 수치(`6개월`, `팀원 4명`, `3000만원`, `15퍼센트`) → **전수 보존**
    - 문장 구조 숫자·한글 단어(`3가지`, `2단계`, `1번`, `실제로`, `문제로`, `제로베이스`, `4문항`, `5급`, `2026년`) → **오탐 0건 보존**
    - 허위 수치(`12시간`, `2시간`, `40건`, `18.5%p`, `2.5배`, `3억원`, `1,200만원`, `0건`, `Zero`, `제로`) → **전수 `[본인 수치 입력]` 치환 (`remainingUnverified = 0`)**
  - `/sample` 데이터(`SAMPLE_RAW_INPUT` vs `SAMPLE_DIAGNOSIS_SUMMARY.sampleFix.afterExample` 및 `SAMPLE_RESUME_ITEMS` 4문항): 미검증 수치 **0건** 확인.
  - 라이브 `CHECK 3`, `CHECK 4`, `CHECK 6` 생성 결과물 전수: 입력 원문 외 수치 **0건** 통과.

### 6-2. `'합격'` 표현 완전 제거 + 실제 기관명(`한국도로공사`) 및 브랜드(`Korean Resume AI`) 통일 검사

- `src/components/*`, `src/app/*`, `src/lib/*`, `blogData.ts` 10편 및 메타데이터/프롬프트 전면 정비 후 프로덕션 빌드(`.next`) 기준 대소문자 구분 검색 결과:

```text
src_matches=0
next_static_matches=0
next_server_matches=0
next_html_matches=0
```

*(검색 패턴: `합격|한국도로공사|Korean Resume`, `-CaseSensitive`)*

- `/sample`: `한국도로공사` → `OO공사`, `합격권(80점 이상)` → `완성도 우수 구간(80점 이상)` 교체 완료.
- 브랜드 표기: `Korea Resume AI`로 전역 통일 완료 (`Footer.tsx`, `about/page.tsx`, `terms/page.tsx` 포함).
- 핵심 정책 문구 통일 (`src/lib/policy.ts` 단일 상수 `REFUND_SUMMARY_TEXT`, `PAID_GENERATIONS_BREAKDOWN` 참조):
  - 환불 정책 요약(`PaymentSection.tsx`, `PackageComparisonTable.tsx`, `refund/page.tsx`, `FAQAccordion.tsx`): `"최초 생성 실패 시 자동 전액 환불, 면접 질문만 실패 시 무료 재시도"`
  - 생성 횟수 내역(`HomeClient.tsx`, `DiagnosisReportView.tsx`, `PackageComparisonTable.tsx`, `terms/page.tsx`, `FAQAccordion.tsx`): `"총 3회(미리보기 해제 1회 + 재생성 2회)"`
  - `HomeClient.tsx` `"메모로 새로 쓰기"` 탭: `1문항 무료 미리보기` 배지 및 `(2~4번 문항 및 면접 10선은 결제 후 잠금 해제)` 안내 명시.

### 6-3. 채점 자기일관성 검증 (교정 전 vs 유료 완성본 교정 후 3개 샘플 재진단)

- 동일한 채점 루브릭(`/api/diagnose`)으로 초안을 진단한 뒤, 추출된 약점 목록을 입력으로 `generateFourQuestionsResume` 교정을 실행(허위 수치 차단기 통과 확인)하고, 생성된 2번 문항(`직무역량 및 문제해결 경험`)을 다시 `/api/diagnose`로 재진단한 결과입니다.

| 테스트 샘플 | 교정 전 (글자수 / 점수 / 블라인드 위반) | 교정 후 (글자수 / 점수 / 블라인드 위반) | 점수 상승폭 | 미검증 수치 | 플레이스홀더 사용 |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **샘플 A** (블라인드 위반 + 추상 단문) | 131자 / **32점 (D)** / 1건 | 464자 / **81점 (A)** / 0건 | **+49점** | **0건** | `[본인 수치 입력]` 2회 |
| **샘플 B** (일부 수치 포함 + 역할·행동 모호) | 176자 / **49점 (D)** / 0건 | 510자 / **87점 (A)** / 0건 | **+38점** | **0건** | `[본인 수치 입력]` 2회 |
| **샘플 C** (프로젝트 경험 + 두괄식·근거 보완) | 164자 / **59점 (C)** / 0건 | 506자 / **83점 (A)** / 0건 | **+24점** | **0건** | `[본인 수치 입력]` 1회 |

→ **3종 모두 유료 완성본 교정 후 진단 점수가 일관되게 크게 상승(`+24점 ~ +49점`)하였으며, 미검증 수치 유입 0건 검증 완료.**

### 6-4. 무료 경로 50초 시간 예산 구조 & 실패 시 무료 크레딧 무차감 RAW 검증

#### 시간 예산 구조 (`maxDuration = 60s` 방어)

```text
Vercel Serverless Function (maxDuration = 60,000ms)
├── 1차 시도 (GEMINI_CONFIG.PRIMARY_MODEL: gemini-3.8-flash) ── 최대 30,000ms
├── 폴백 재시도 (GEMINI_CONFIG.FALLBACK_MODEL: gemini-3.7-flash) ── 최대 20,000ms
├── 총 AI 호출 시간 예산 (totalBudgetMs) ────────────────────── 최대 50,000ms
└── 잔여 안전 여유분 (요청 파싱·Redis Lua 예약/저장·응답 직렬화) ─ 10,000ms 확보
```

#### 강제 실패 시 무료 크레딧 자동 복구 RAW 트레이스 (`CHECK 7`)

- `src/lib/redis.ts`의 `reserveFreeRateLimit`(원자적 Lua `INCR` 선점 + `catch` 블록 `freeReservation.refund()` `DECR`/`DEL` 복구)를 `/api/diagnose`, `/api/generate(isFree: true)`, `/api/interview/generate(isFree: true)`에 모두 적용했습니다.

```json
[
  {
    "step": "7-1 /api/diagnose (forced Gemini error)",
    "status": 500,
    "freeQuotaRestored": true,
    "freeRemaining": 2,
    "redisCounterValue": null
  },
  {
    "step": "7-2 /api/generate isFree=true (forced Gemini error)",
    "status": 500,
    "freeQuotaRestored": true,
    "freeRemaining": 2,
    "redisCounterValue": null
  },
  {
    "step": "7-3 /api/interview/generate isFree=true (forced Gemini error, limit=1)",
    "status": 500,
    "freeQuotaRestored": true,
    "freeRemaining": 1,
    "redisCounterValue": null
  },
  {
    "step": "7-4 /api/diagnose (live success #1)",
    "status": 200,
    "freeRemaining": 1,
    "redisCounterValue": 1
  },
  {
    "step": "7-5 /api/diagnose (forced error after 1 use -> restored to remaining=1)",
    "status": 500,
    "freeQuotaRestored": true,
    "freeRemaining": 1,
    "redisCounterValue": 1
  },
  {
    "step": "7-6 /api/diagnose (live success #2 -> remaining=0)",
    "status": 200,
    "freeRemaining": 0,
    "redisCounterValue": 2
  },
  {
    "step": "7-7 /api/diagnose (3rd call exceeds limit -> 429)",
    "status": 429,
    "code": "FREE_LIMIT_EXCEEDED",
    "freeRemaining": 0
  }
]
```

### 6-5. 네이버 서치어드바이저 메타태그 및 프로덕션 배포 실측 검증

- `src/app/layout.tsx` `metadata.verification.other["naver-site-verification"]` = `"db2fc7347a4bd68976c437508b13bbd79e4dbc16"` 반영 완료 (커밋 `84bccae`).
- 커밋 `66e0776` (`7058c6d`, `cefb1ef`, `c0fab6e` 포함) Vercel 프로덕션 배포 후 실운영 `https://korea-resume.com` 9개 엔드포인트 실측 응답(금칙어 `합격|한국도로공사|Korean Resume` 전수 0건):

```text
{"url":"https://korea-resume.com/","status":200,"bytes":31290,"matchedMarkers":["db2fc7347a4bd68976c437508b13bbd79e4dbc16","1문항 무료 미리보기","총 3회(미리보기 해제 1회 + 재생성 2회)","최초 생성 실패 시 자동 전액 환불, 면접 질문만 실패 시 무료 재시도","Korea Resume AI"],"missingMarkers":[],"foundForbidden":[],"naverMetaTag":"<meta name=\"naver-site-verification\" content=\"db2fc7347a4bd68976c437508b13bbd79e4dbc16\"/>"}
{"url":"https://korea-resume.com/sample","status":200,"bytes":40018,"matchedMarkers":["OO공사","완성도 우수 구간(80점 이상)","[본인 수치 입력]","경영·회계·사무 (R600002)"],"missingMarkers":[],"foundForbidden":[]}
{"url":"https://korea-resume.com/privacy","status":200,"bytes":33522,"matchedMarkers":["7,200"],"missingMarkers":[],"foundForbidden":[]}
{"url":"https://korea-resume.com/refund","status":200,"bytes":14166,"matchedMarkers":["최초 생성 실패 시 자동 전액 환불, 면접 질문만 실패 시 무료 재시도"],"missingMarkers":[],"foundForbidden":[]}
{"url":"https://korea-resume.com/about","status":200,"bytes":13519,"matchedMarkers":["Korea Resume AI"],"missingMarkers":[],"foundForbidden":[]}
{"url":"https://korea-resume.com/terms","status":200,"bytes":14514,"matchedMarkers":["Korea Resume AI","총 3회(미리보기 해제 1회 + 재생성 2회)"],"missingMarkers":[],"foundForbidden":[]}
{"url":"https://korea-resume.com/blog","status":200,"bytes":30437,"matchedMarkers":["서류·면접 실전 취업 가이드","서류 경쟁력을 높이는 자소서의 비밀, STAR 기법 완전 정복"],"missingMarkers":[],"foundForbidden":[]}
{"url":"https://korea-resume.com/blog/cover-letter-no-spec-strategy","status":200,"bytes":19165,"matchedMarkers":["스펙이 없어도 돋보이는 자소서의 비밀"],"missingMarkers":[],"foundForbidden":[]}
{"url":"https://korea-resume.com/sitemap.xml","status":200,"bytes":84646,"matchedMarkers":["https://korea-resume.com/sample"],"missingMarkers":[],"foundForbidden":[]}
```
