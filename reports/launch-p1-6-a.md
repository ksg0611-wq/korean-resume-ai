# P1.6 Phase A 배포 및 검증 보고서 (공공기관 AI 면접 시뮬레이터)

- **작성 시각**: 2026-11-16 KST (`2026-11-15T23:43Z`)
- **프로덕션 URL**: `https://korea-resume.com/interview`
- **배포 커밋 (`origin/main`)**:
  1. `0f70fc9` — `feat(p1.6-a): add interview policy constants, 7-day session Lua store, rubric & consistency engine`
  2. `0ee97ca` — `feat(p1.6-a): add interview generate/evaluate/session APIs, 4900 verification & note auto-sync`
  3. `ad9f928` — `feat(p1.6-a): public-sector interview simulator UI, 7-day continuation & policy/FAQ sync`
  4. `6dffe54` — `fix(p1.6-a): stabilize observable rubric anchors, timeouts, and add verification suite`

---

## 1. 구현 범위 및 테스트 환경 투명성

### Phase A 구현 요약 (조정 조건 #1~#4 반영)
- **7일 유료 세션 및 재열람 이어하기**: `interview_session:{sessionId}` TTL을 무료 `2시간(7,200초)`, 유료 `7일(604,800초)`로 분리하고 `/result/[orderId]?token=...`에서 `"이어서 모의면접 연습하기 (잔여 채점 N/45회)"` 동선 및 `GET /api/interview/session` 상수 시간 토큰 검증·복구를 구현했습니다. 면접 이용권 `initialGenerations`는 `1`(1개 활성 세션 = 15문항 + 최대 45회 채점·꼬리질문)입니다.
- **면접 대비 노트 자동 저장·실시간 갱신**: 유료 15문항 초기 생성 직후 `result:{orderId}`(7일 TTL)를 즉시 생성하고 `sendResultEmail`을 발송하며, `/api/interview/evaluate` 호출마다 기존 토큰·TTL을 유지한 채 `interviewNote`와 `.txt` 본문을 자동 갱신합니다.
- **인성 문항 일관성 `'해당 없음'` 및 85→100점 환산**: 자소서 경험과 무관한 인성/가치관 답변은 15점 무상 부여 없이 `"해당 없음"`(`score: null, applicable: false`) 처리 후 `Math.round((rawScore85 / 85) * 100)`으로 환산합니다.
- **오류 방어 및 정책/FAQ 동기화**: `OrderStatus`에 `"interview_pending"` 상태 및 `/admin` 필터·배지를 반영하고, `/privacy`, `/terms`, `/refund`, `FAQAccordion`을 확정 요금(`4,900원`/`7,900원`/`+3,000원`), 7일/2시간 보관 주기, 45회 한도, 채점 오류 원복 및 부분 실패 수동 부분 환불 정책과 동기화했습니다.
- **범위 경계**: Phase B(`1분 자기소개 대본 모드`, `/jobs/[sn]` CTA) 및 Phase C(`7,900원` 통합 패키지·`+3,000원` 업그레이드 결제 UI/핸들러)는 다음 단계 범위로 본 작업에 포함하지 않았습니다.

### 테스트 환경 경계 (Verification Scope)
- **실시간 AI 호출**: Google Gemini API (`GEMINI_API_KEY` 기반 실호출 — `gemini-3.8-flash` / `gemini-3.7-flash` 폴백 체인).
- **인프라 모의 범위**: `scripts/verify-p1-6-a.mjs` 실행 시 프로덕션 Redis/결제 데이터를 오염시키지 않기 위해 인프로세스 Upstash Redis REST·Lua 에뮬레이터(`127.0.0.1`), 토스페이먼츠 API 모의(`confirm`/`cancel`), Resend 이메일 모의를 사용했습니다.
- **프로덕션 검증 범위**: `https://korea-resume.com` 배포 완료 후 실제 HTTPS `GET`/`POST` 읽기 전용 점검을 수행했습니다.

---

## 2. 정적 검증 · 빌드 · 문구 검수 결과

- `npx tsc --noEmit`: **Exit 0** (오류 0건)
- `Select-String ... -Pattern "합격"` (Phase A UI·API·약관·정책·FAQ 전체): **0건** (서비스·결제 화면 `'합격'` 보장 문구 미포함)
- `npm run build`: **Exit 0** (27개 정적 페이지 및 `/interview`, `/api/interview/*`, `/result/[orderId]`, `/privacy`, `/terms`, `/refund` 컴파일 완료)

```text
Route (app)                              Size     First Load JS
├ ƒ /api/interview/evaluate              0 B                0 B
├ ƒ /api/interview/generate              0 B                0 B
├ ƒ /api/interview/payment               0 B                0 B
├ ƒ /api/interview/session               0 B                0 B
├ ○ /interview                           15.3 kB         112 kB
├ ○ /privacy                             145 B          87.2 kB
├ ○ /refund                              145 B          87.2 kB
├ ƒ /result/[orderId]                    6.1 kB          103 kB
└ ○ /terms                               179 B            94 kB
```

---

## 3. 실증 1: 동일 답변 3회 반복 채점 편차 (`±5점` 이내 기준)

`evaluateInterviewAnswerWithAI` + `buildInterviewEvaluationReport`에 동일 직무 질문(`q1`)·자소서·모범 답변(`335자`)을 3회 연속 실호출한 결과입니다 (`verify-p1-6-a-results.json`).

| 회차 | 사용 모델 | 소요 시간(ms) | STAR (25) | 수치·역할 (25) | 질문·NCS 적합성 (20) | 간결성 (15) | 일관성 (15) | 총점 (등급) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1회차 | `gemini-3.8-flash` | 7,002 | 19 | 19 | 16 | 15 | 15 | **84점 (A)** |
| 2회차 | `gemini-3.8-flash` | 6,248 | 19 | 19 | 16 | 15 | 15 | **84점 (A)** |
| 3회차 | `gemini-3.8-flash` | 7,851 | 19 | 19 | 16 | 15 | 15 | **84점 (A)** |

- **최대-최소 편차**: `84 - 84 = 0점` (**통과**, 기준 `±5점` 이내)

---

## 4. 실증 2: 약한 답변 3개 vs 강한 답변 3개 분포 & 인성 `'해당 없음'` 85→100점 환산

| 구분 | 샘플 유형 (글자수) | STAR(25) | 수치·역할(25) | 적합성(20) | 간결성(15) | 일관성(15) | 총점 (등급) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 약한 답변 1 | 방향만 맞고 구체 행동·수치 전무 (`175자`) | 9 | 5 | 7 | 11 | 15 | **47점 (D)** |
| 약한 답변 2 | 협업 위주 주어 불명·개인 기여 모호 (`165자`) | 9 | 2 | 10 | 11 | 10 | **42점 (D)** |
| 약한 답변 3 | 일반 다짐 위주·질문 직답 미흡 (`160자`) | 9 | 5 | 10 | 11 | 15 | **50점 (C)** |
| 강한 답변 1 | 민원 오기입 진단·12개 체크리스트·67% 수치 (`335자`) | 19 | 19 | 16 | 15 | 15 | **84점 (A)** |
| 강한 답변 2 | 회계 영수증 12건 누락·SUMIF 검증·100% (`230자`) | 17 | 22 | 16 | 11 | 15 | **81점 (A)** |
| 강한 답변 3 | 공모전 자료조사·통계 우선순위·오류 2건 교정 (`193자`) | 19 | 19 | 16 | 11 | 15 | **80점 (A)** |

- **인성 문항(`questionKind: "personality"`) 85→100점 환산 실측**:
  ```json
  {
    "questionKind": "personality",
    "consistencyStatusLabel": "해당 없음",
    "consistencyApplicable": false,
    "consistencyScore": null,
    "rawScore85": 57,
    "expectedScaled100": 67,
    "actualTotalScore": 67,
    "scoreFormulaNote": "85점 만점 기준 57점 → 100점 환산 적용 (일관성 해당 없음)",
    "durationMs": 5385
  }
  ```

---

## 5. 실증 3: 자소서 ↔ 답변 일관성 벤치마크 (일치 5쌍 / 불일치 5쌍)

- **일치 데이터셋 (C1~C5, 정상 구체화·동의어 재진술 포함)**: **오탐률 `0/5 (0%)`** (5쌍 모두 `"일관성 문제 없음"`, 15점, `mismatches: []`)
- **불일치 데이터셋 (M1~M5)**: **탐지율 `5/5 (100%)`** (5쌍 모두 `"불일치 발견"`, 0점, 원문 양측 문자열 검증 통과)

| ID | 유형 | 기대 결과 | 판정 상태 | 일관성 점수 | 탐지된 불일치 원문 인용 (검증됨) |
| --- | --- | --- | --- | ---: | --- |
| `C1` | 인턴 보조 + 수치 구체화 | 일치 | `일관성 문제 없음` | 15 | `0건` |
| `C2` | 회계 결산 구체화 | 일치 | `일관성 문제 없음` | 15 | `0건` |
| `C3` | 공모전 자료조사 재진술 | 일치 | `일관성 문제 없음` | 15 | `0건` |
| `C4` | 콜센터 일 45건 + 스크립트 구체화 | 일치 | `일관성 문제 없음` | 15 | `0건` |
| `C5` | 도서관 근로장학생 구체화 | 일치 | `일관성 문제 없음` | 15 | `0건` |
| `M1` | 역할 과장 (`보조` → `총괄 팀장·단독 결재`) | 불일치 | `불일치 발견` | 0 | 자소서 `"단순 자료 취합과 복사 등 보조 업무"` ↔ 답변 `"공단 예산기획부 총괄 팀장 역할... 단독으로 결정"` |
| `M2` | 수치 과장 (`5건/80명` → `200건/15,000명`) | 불일치 | `불일치 발견` | 0 | 자소서 `"카드뉴스 5건을 제작했고 팔로워가 80명 늘었습니다"` ↔ 답변 `"카드뉴스 200건을 직접 올렸고... 팔로워 15,000명을 달성"` |
| `M3` | 기간·역할 왜곡 (`4주 인턴` → `2년 6개월 대리`) | 불일치 | `불일치 발견` | 0 | 자소서 `"여름방학 4주간의 단기 체험형 인턴"` ↔ 답변 `"2년 6개월 동안 정규직 대리로 장기 근무"` (2건 탐지) |
| `M4` | 기여도 왜곡 (`회의록만` → `Python 전과정 혼자`) | 불일치 | `불일치 발견` | 0 | 자소서 `"Python 데이터 분석 코드는 다른 팀원 2명이 전부 구현"` ↔ 답변 `"Python 머신러닝 예측 모델... 혼자 코딩하고 구축"` |
| `M5` | 결과 왜곡 (`1차 탈락` → `대상 수상·500만원`) | 불일치 | `불일치 발견` | 0 | 자소서 `"1차 예선 심사에서 아쉽게 탈락하며"` ↔ 답변 `"최고상인 대상을 수상해 상금 500만 원을 받았고"` |

---

## 6. 실증 4: 동적 꼬리질문 1→2→3단계 연쇄 3건 + 수치 날조 0건 + 무료 마스킹

3개 질문(직무 2개·인성 1개)에 대해 기본 답변(`depth=0`)부터 3단계 심층 답변(`depth=3`)까지 연쇄 호출한 결과입니다.
모든 단계에서 `findUnverifiedMetrics(modelAnswer / feedback3Lines / digPoint, allowedSourceText)` 결과 **미검증 정량 수치 `0건`**이었고, 3단계 완료 시 `nextFollowUp === null`, `depth=0` 무료 변환 시 `modelAnswer === null, modelAnswerLocked === true`가 확인되었습니다.

| 체인 | 단계 | 총점 | 일관성 | 생성된 다음 꼬리질문 (요약) | 미검증 수치 | 소요(ms) |
| --- | --- | ---: | --- | --- | ---: | ---: |
| Chain-1 (민원 체크리스트) | `0 → 1` | 84 | 일관성 문제 없음 | `"체크리스트 비치와 사전 안내 외에 다른 방식의 개선안은 검토하지 않으셨는지..."` | 0건 | 6,919 |
| Chain-1 | `1 → 2` | 76 | 일관성 문제 없음 | `"모바일 안내 등 디지털 대안과 시각장애인·고령 민원인 확인 누락 리스크 대비책은?"` | 0건 | 8,804 |
| Chain-1 | `2 → 3` | 68 | 일관성 문제 없음 | `"디지털 수단을 배제한 명확한 기준과 중증 시각장애인 현장 응대 방법은?"` | 0건 | 6,704 |
| Chain-1 | `3 (종료)` | 46 | 일관성 문제 없음 | `null` | 0건 | 5,434 |
| Chain-2 (회계 SUMIF) | `0 → 1` | 80 | 일관성 문제 없음 | `"매주 금요일 정산 규칙 도입 시 영수증 분실 팀원 사실관계 교차 검증 방법은?"` | 0건 | 6,497 |
| Chain-2 | `1 → 2` | 74 | 일관성 문제 없음 | `"카드 전표 재발급 등 공적 증빙 대안 대비 간이 사진 방식 선택 근거와 방지책은?"` | 0건 | 6,498 |
| Chain-2 | `2 → 3` | 58 | 일관성 문제 없음 | `"사진만으로 지출 확정 시 공공기관 감사 기준 증빙 효력 보완 방안은?"` | 0건 | 7,486 |
| Chain-2 | `3 (종료)` | 64 | 일관성 문제 없음 | `null` | 0건 | 5,609 |
| Chain-3 (인성 민원 갈등) | `0 → 1` | 72 | 해당 없음 | `"유관기관 연계 불가능으로 민원인이 고성을 지르며 완강히 거부할 때 대처 기준은?"` | 0건 | 6,904 |
| Chain-3 | `1 → 2` | 47 | 해당 없음 | `"분리 안내·대안 제시마저 거부하고 폭언을 지속할 때 기관 매뉴얼상 즉각 조치는?"` | 0건 | 6,354 |
| Chain-3 | `2 → 3` | 29 | 해당 없음 | `"민원처리법상 폭언 발생 시 사전 녹음 고지·퇴거 요청·경찰 신고 인계 기준은?"` | 0건 | 6,356 |
| Chain-3 | `3 (종료)` | 51 | 해당 없음 | `null` | 0건 | 5,624 |

---

## 7. 실증 5: 45회 Lua 소진(`429`)·오류 복구·`result:*` 자동 갱신·7일 이어하기 E2E 로그

`node scripts/verify-p1-6-a.mjs --only-e2e` 실행 결과 (`verify-p1-6-a-e2e.json`):

```json
{
  "wrongAmountPayment": {
    "status": 403,
    "body": { "message": "허용되지 않은 결제 금액(3000원)입니다.", "code": "INVALID_PAYMENT_AMOUNT" }
  },
  "valid4900Payment": {
    "status": 200,
    "orderId": "TEST_P16A_1794785928645",
    "remainingGenerations": 1,
    "statusField": "paid"
  },
  "paidGenerate15Q": {
    "status": 200,
    "totalQuestions": 15,
    "jobQuestions": 10,
    "personalityQuestions": 5,
    "sessionTtlSeconds": 604800,
    "resultTtlSeconds": 604800,
    "initialEmailSent": true,
    "emailSubject": "[Korea Resume AI] AI 공공기관 면접 시뮬레이터 대비 노트 재열람 링크(7일 유효) 및 결제 영수증 안내",
    "remainingGenerationsAfterGen": 0,
    "usedCountAfterGen": 1
  },
  "evalErrorRollback": {
    "status": 500,
    "quotaRestored": true,
    "remainingAfterRollback": 45,
    "usedAfterRollback": 0,
    "lockReleased": true
  },
  "concurrentLockConflict": { "status": 409, "code": "EVAL_IN_PROGRESS" },
  "eval1AndResultAutoSync": {
    "evalStatus": 200,
    "remainingEvaluations": 44,
    "totalScore": 84,
    "resultGetStatus": 200,
    "noteAnsweredCount": 1,
    "noteUsedEvaluations": 1,
    "noteRemainingEvaluations": 44,
    "noteEntriesCount": 15
  },
  "quotaExhaustion45And46": {
    "eval45Status": 200,
    "eval45Remaining": 0,
    "eval46Status": 429,
    "eval46Body": {
      "error": "세션당 최대 45회(15문항 × 3단계) 답변 채점 한도를 모두 소진했습니다.",
      "code": "EVALUATION_LIMIT_EXCEEDED"
    }
  },
  "sevenDaySessionResumption": {
    "badTokenStatus": 403,
    "validTokenStatus": 200,
    "cacheControlHeader": "private, no-store, max-age=0, must-revalidate",
    "referrerPolicyHeader": "no-referrer",
    "restoredQuestionCount": 15,
    "restoredThreadsKeys": ["q1", "q2"],
    "restoredUsedEvaluations": 45
  },
  "freeTierLimitsAndMasking": {
    "gen1Status": 200,
    "freeQuestionCount": 3,
    "lockedQuestionCount": 12,
    "freeSessionTtlSeconds": 7200,
    "freeEvalStatus": 200,
    "freeEvalModelAnswer": null,
    "freeEvalModelAnswerLocked": true,
    "freeEvalFollowUpLocked": true,
    "freeFollowUpAttemptStatus": 403,
    "freeFollowUpAttemptCode": "FREE_FOLLOWUP_LOCKED",
    "freeGen2DailyLimitStatus": 429
  }
}
```

---

## 8. 실증 6: 프로덕션(`https://korea-resume.com`) 배포 확인 raw 로그

`6dffe54` 푸시 후 Vercel 프로덕션 반영 확인 결과:

```text
/interview 200 [ '공공기관 AI 면접 시뮬레이터', '공공기관 경영·회계·사무' ]
/privacy 200 [
  'interview_session:*) / 유료 결제 결과·면접 대비 노트(result:*) 및 유료 면접 세션 Redis 임시 저장'
]
/terms 200 [ '자소서+면접 통합 패키지(7,900원)' ]
/refund 200 [ '수동 부분 환불을 진행해 드립니다.' ]
/api/interview/session forbidden check: 403 {"error":"유효하지 않은 재열람 인증 토큰입니다.","code":"FORBIDDEN"} cache: private, no-store, max-age=0, must-revalidate
/api/interview/evaluate (empty body): 400 {"error":"sessionId, questionId, depth(0~3) 값이 필요합니다."}
```
