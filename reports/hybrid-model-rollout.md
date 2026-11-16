# 엔드포인트별 하이브리드 모델 분리 적용 및 검증 보고서 (`gemini-4-hydrogen` × `gemini-3.8-flash`)

- **작성일**: 2026-11-16
- **적용 기준**: 블라인드 A/B 벤치마크([reports/model-benchmark-4-hydrogen.md](file:///d:/안티그래비티/korean%20resume%20tool/reports/model-benchmark-4-hydrogen.md)) 승인안 `[1]~[5]`

---

## 1. 용도별 하이브리드 모델 라우팅 구조

`src/lib/gemini.ts`의 `GEMINI_CONFIG`에 용도별 모델을 분리 정의하고, 기존 엔드포인트별 `thinkingLevel`·단일 JSON 응답 스키마를 100% 보존했습니다.

| 엔드포인트 / 함수 | 상수 키 | 적용 모델 | 폴백 모델 | `thinkingLevel` | 변경 근거 |
|---|---|---|---|---|---|
| `evaluateDiagnosisWithAI` (`/api/diagnose`) | `SCORING_MODEL` | `gemini-3.8-flash` | `gemini-3.8-flash` | `"low"` | 채점 일관성 동등·원가 40.5% 절감 |
| `evaluateInterviewAnswerWithAI` (`/api/interview/evaluate`) | `SCORING_MODEL` | `gemini-3.8-flash` | `gemini-3.8-flash` | `"low"` | 3~5초 응답 목표·단일 JSON 호출 유지·원가 2.4배 절감 |
| `generateInterviewQuestionSet` 무료 3문항 (`/api/interview/generate` `isFree: true`) | `FREE_MODEL` | `gemini-3.8-flash` | `gemini-3.8-flash` | `"low"` | 무료 체험 방어 및 빠른 응답 |
| `generateFourQuestionsResume` (`/api/generate` `isFree: true` 미리보기 & 유료 완성본·교정본) | `WRITING_MODEL` | `gemini-4-hydrogen` | `gemini-3.8-flash` | `"medium"` | 미리보기가 결제 시 그대로 잠금 해제되므로 유료 동일 품질·100% 분량 준수 적용 |
| `generateInterviewQuestionSet` 유료 15문항 (`/api/interview/generate` `isFree: false`) | `WRITING_MODEL` | `gemini-4-hydrogen` | `gemini-3.8-flash` | `"low"` | 유료 15문항 심층 출제 + 수치 가드 결합 |
| `generateTenInterviewQuestions` (자소서 패키지 10문항·`/api/interview/retry`) | `WRITING_MODEL` | `gemini-4-hydrogen` | `gemini-3.8-flash` | `"low"` | 회당 +0.40원 차이로 원문 수치 충실도 확보 |
| `handlePaidGeneration` (레거시 단문 유료 핸들러) | `WRITING_MODEL` | `gemini-4-hydrogen` | `gemini-3.8-flash` | `"medium"` | 유료 생성 일관성 유지 |

---

## 2. `gemini-4-hydrogen` 4문항 생성 `low` vs `medium` 비교 및 Vercel 60초 예산 설계

### 2-1. 동일 5종 입력(`memo-1`, `memo-2`, `rev-A`, `rev-B`, `rev-C`) 실험 비교

| 항목 | `gemini-4-hydrogen` (`thinkingLevel: "low"`) | `gemini-4-hydrogen` (`thinkingLevel: "medium"`) | 판정 |
|---|---|---|---|
| **450~550자 분량 준수율** | **8/20 (40.0%)** (`384~498자`, `memo-2`는 **0/4**) | **20/20 (100.0%)** (`469~543자`) | **`medium` 유지 필수** |
| 문항별 글자수 (`Q1~Q4`) | `memo-1`: `498,464,445,441`<br>`memo-2`: `415,421,411,384`<br>`rev-A`: `392,465,430,395`<br>`rev-B`: `473,451,450,434`<br>`rev-C`: `432,456,450,425` | `memo-1`: `473,507,490,469`<br>`memo-2`: `493,495,507,479`<br>`rev-A`: `501,512,505,484`<br>`rev-B`: `487,484,495,492`<br>`rev-C`: `500,543,542,495` | `low`에서 `rev-A/C`의 `thinkingTokens=0` 발생하며 분량 미달 |
| 미검증 수치 (`raw` / `post`) | `0건 / 0건` | `0건 / 0건` | 동등 |
| 교정 점수 향상 (`rev-A/B/C` Q2) | `32→81 (+49)` / `49→89 (+40)` / `57→80 (+23)` (평균 `83.3점`) | `30→83 (+53)` / `49→87 (+38)` / `65→87 (+22)` (평균 `85.7점`) | `medium` 우위 |
| 문장 밀도·표현 정교도 (`rev-A Q2` 등) | `"행사 일정이 [본인 수치 입력] 앞으로..."` 등 어색한 공란 삽입·소제목 일부 누락 | `"식비·홍보비·비품비 등 계정과목별 재분류"`, `"지출 결의 양식"`, `"인수인계 표준 문서"` 등 구체 실무 어휘 유지 | `medium` 뚜렷하게 우수 |
| 지연시간 (`p50` / `max`) | `15,901ms` / `16,504ms` | `25,484ms` / `35,966ms` | `medium` 유지 시 1차 타임아웃 상향 필요 |
| 평균 토큰 (`p / c / th`) | `1,138.6` / `993.0` / `1,124.0` | `1,073.7` / `1,118.0` / `4,859.3` | 원가는 `medium` 기준 반영 |

> **결론**: `low` 설정 시 `450~550자` 준수율이 `100% → 40%`로 급락하고 문장 구체성도 저하되므로, `generateFourQuestionsResume`는 **`thinkingLevel: "medium"`을 유지**하고 1차 타임아웃(`perAttemptTimeoutMs`)을 `42,000ms`로 상향했습니다.

### 2-2. Vercel `maxDuration = 60`s (`60,000ms`) 시간 예산표

기존 `src/lib/gemini.ts`의 내부 클램프(`perAttemptTimeoutMs <= 35,000ms`, `totalBudgetMs <= 50,000ms`)와 `cancelTossPayment` 타임아웃(`8,000ms`), 그리고 유료 예외 처리 시 `reportServerError`가 환불보다 먼저 실행되던 순서를 함께 정비해 최악 실패 경로에서도 60초 한도 내 안전하게 종료되도록 설계했습니다.

| 구간 | 기존 설정 | 변경 후 설정 | 최대 소요 | 비고 |
|---|---|---|---|---|
| 0. 요청 검증 + Redis 잠금(`beginPaidGeneration`) | ~300ms | ~300ms (최대 1,000ms) | `1,000ms` | 주문 상태·결제 잠금 |
| 1. 1차 시도 (`WRITING_MODEL`: `gemini-4-hydrogen`, `medium`) | `30,000ms` | **`42,000ms`** | `42,000ms` | `gemini.ts` 상한 클램프 `35s → 45s` 상향 |
| 2. 2차 폴백 (`FALLBACK_MODEL`: `gemini-3.8-flash`, `medium`) | `20,000ms` | **`12,000ms`** | `12,000ms` | `totalBudgetMs = 54,000ms` (클램프 `50s → 55s` 상향) |
| 3. AI 전체 예산 소계 (`1차 + 폴백`) | `50,000ms` | **`54,000ms`** | `54,000ms` | `3.8-flash` 폴백 p50 `~11.9s` 대응 |
| 4. 실패 시 자동 환불 (`handlePaidGenerationFailure` → `cancelTossPayment`) | `reportServerError`(2.5s) 후 Toss(`8,000ms`) | **환불 우선 실행** + Toss **`4,000ms`** 상한 + Redis 완료 | `4,300ms` | `paymentHandlers.ts`에서 알림 전 환불 선행 (`orders.ts` `timeoutMs: 4000`) |
| 5. 사후 에러 알림 (`reportServerError`) | 2,500ms (환불 전) | 환불/락 해제 완료 후 실행 | `~500ms` | Webhook/Sentry 미설정 시 `0ms` |
| **총 최악 경로 합계** | ~61,500ms+ (초과 위험) | **최대 `59,300ms` (통상 장애 시 `~55,000ms`)** | **`<= 60,000ms`** | Vercel `maxDuration = 60`s 안전 충족 |

---

## 3. 면접 질문 생성기(`15Q`/`10Q`) 수치 예외 방지 및 회귀 테스트

`gemini-4-hydrogen`이 `15Q-4` 케이스에서 범했던 **원문 인원·시간 임의 합산(`3명 × 4시간 → "12시간"`)**과 **가상 배수 스트레스 테스트(`"10배"`)**를 차단하기 위해 프롬프트와 후처리를 이중 보강했습니다.

1. **프롬프트 강화 (`src/lib/interviewGenerator.ts`)**: `[작성 규칙]` 3번에 원문 인원×시간 임의 합산 금지, 가상 배수·비율·건수(`"10배"` 등) 금지, `"대폭"`, `"크게"`, `"다수"` 등 정성 표현 사용, `[본인 수치 입력]` 대괄호 금지 명시.
2. **질문 전용 정성 치환 가드 (`src/lib/textMetrics.ts` → `sanitizeInterviewQuestionText`)**:
   - `UNVERIFIED_QUANT_REGEX` 기반(아울러 `20여 명`, `10여 건` 형태도 탐지하도록 확장)으로 자소서 원문에 없는 수치 표현(인접 `약/대략`, `이상/가량/정도` 등 수식어 포함)을 탐지하되, **`[본인 수치 입력]`을 절대 삽입하지 않고** 단위·조사에 맞는 자연스러운 한국어 정성 표현(`"12시간 이상"` → `"상당한 시간"`, `"10배 이상"` → `"크게"`, `"10배로"` → `"여러 배로"`, `"100건 이상"` → `"여러 건"`, `"제로"` → `"전무한 수준"`)으로 자동 대체.
   - `generateInterviewQuestionSet`(`15Q`/`3Q`)과 `generateTenInterviewQuestions`(`10Q`) 모두에 적용.
3. **자동 회귀 테스트 (`scripts/verify-interview-15q-metrics.mjs`)**:
   - 단위 테스트: `15Q-4` 실패 원문 2건(`Q6` `"12시간"`, `Q10` `"10배"`) 및 한국어 조사/수식어 에지 케이스 전수 통과 (`[본인 수치 입력]` 0건, 원문 `15분`/`3명`/`4시간` 보존, `findUnverifiedMetrics === []`).
   - 라이브 API 회귀 (`--live`): `generateInterviewQuestionSet` (`isFree: false`, `15Q-4`) 호출 시 `usedModel = "gemini-4-hydrogen"`, 15문항 모두 `findUnverifiedMetrics === []` & `[본인 수치 입력]` 0건 (`16,290ms`); `isFree: true` `3Q` (`gemini-3.8-flash`, `4,836ms`), `/api/diagnose` (`gemini-3.8-flash`, `9,861ms`), `/api/interview/evaluate` (`gemini-3.8-flash`, `6,163ms`) 모두 통과.

---

## 4. 하이브리드 분리 원가 재산출 (2027.01+ 정규 단가 기준)

- **산출 기준**: 2027년 1월 이후 정규 단가 (`Input $1.50 / 1M`, `Output+Thinking $7.50 / 1M`, 환율 `1,400원/$1`) 및 블라인드 벤치마크 실측 토큰 평균 적용.

### 4-1. 1회 호출당 원가 비교

| 호출 단위 | 모델 (`하이브리드`) | 정규 단가 (2027.01+) | 참고: 2026 프로모션 (`3.8 Flash` 반값) |
|---|---|---|---|
| 자소서 진단 (`diagnose`, `low`) | `gemini-3.8-flash` | **13.67원** | 6.83원 |
| 자소서 4문항 생성·교정 (`4Q`, `medium`) | `gemini-4-hydrogen` | **65.02원** | 65.02원 |
| 자소서 패키지 면접 10문항 (`10Q`, `low`) | `gemini-4-hydrogen` | **18.88원** | 18.88원 |
| 면접 유료 15문항 출제 (`15Q`, `low`) | `gemini-4-hydrogen` | **28.32원** | 28.32원 |
| 면접 무료 3문항 출제 (`3Q`, `low`) | `gemini-3.8-flash` | **6.25원** | 3.12원 |
| 면접 답변 채점 평균 (`eval avg`, `low`) | `gemini-3.8-flash` | **10.67원** | 5.34원 |
| 면접 답변 채점 + 꼬리질문 (`eval followUp`, `low`) | `gemini-3.8-flash` | **11.39원** | 5.70원 |

### 4-2. 상품·체험 단위 총원가 및 판매가 대비 비율 (2027.01+ 정규 단가)

| 상품 / 체험 구분 | 전면 `3.8 Flash` | 전면 `4-hydrogen` | **하이브리드 분리 (적용안)** | **판매가 대비 비중** | 비고 |
|---|---|---|---|---|---|
| **자소서 패키지 1건 최대** (`4Q × 3 + 10Q × 3`) | 107.05원 (2.18%) | 251.68원 (5.14%) | **251.68원** | **5.14%** (`4,900원` 기준) | 10Q 1회(`3×4Q+1×10Q`) 시 `213.93원` (**4.37%**) |
| **면접 시뮬레이터 1건 최대 (평균 기준)** (`15Q × 1 + 채점 × 45`) | 500.57원 (10.22%) | 1,173.67원 (23.95%) | **508.43원** | **10.38%** (`4,900원` 기준) | 전면 `4H` 대비 **-665.24원 (-56.7% 절감)** |
| **면접 시뮬레이터 1건 상한 (45회 전량 꼬리질문)** | 533.03원 (10.88%) | 1,282.68원 (26.18%) | **540.92원** | **11.04%** (`4,900원` 기준) | 전면 `4H` 대비 **-741.76원 (-57.8% 절감)** |
| **자소서+면접 통합 패키지 1건 최대** (`7,900원`) | 607.62원 (7.69%) | 1,425.35원 (18.04%) | **760.11원 ~ 792.60원** | **9.62% ~ 10.03%** | 통합권 역시 10% 선 방어 |
| **무료 자소서 진단** (`1회`) | 13.67원 | 22.96원 | **13.67원** | — | 전면 `4H` 대비 **-40.5%** |
| **무료 미리보기 `mode: "draft"`** (`4Q × 1`) | 17.20원 | 65.02원 | **65.02원** | — | 결제 시 즉시 잠금 해제되는 유료 결과물 동일 품질 투자 |
| **무료 면접 체험** (`3Q + 채점·꼬리질문 1회`) | 17.64원 | 37.01원 | **17.64원** | — | 전면 `4H` 대비 **-52.3%** |

*(참고: 2026년 `gemini-3.8-flash` 50% 프로모션 단가 기준 하이브리드 면접 시뮬레이터 1건 최대 원가는 `268.40원(5.48%)` ~ 상한 `284.60원(5.81%)`, 무료 면접 체험 `8.82원`, 무료 진단 `6.83원`입니다.)*

---

## 5. 프로덕션 배포 및 라이브 검증

- **배포 커밋 (`origin/main`)**:
  - `685cb86` — `feat(metrics): add qualitative interview question metric guard`
  - `b0cfa2d` — `feat(ai): implement hybrid model routing and 42s/12s/4s timeout budget`
  - `7364ff1` — `feat(interview): apply 15Q metric guard and add regression test` (Vercel 배포 완료 확인)
- **빌드·타입·회귀 검증 (`7364ff1` 기준)**:
  - `npx tsc --noEmit`: 오류 0건 통과
  - `npm run build`: 27/27 페이지 빌드 성공
  - `node scripts/verify-payment-timeout-unit.mjs`: 5/5 통과
  - `node scripts/verify-interview-15q-metrics.mjs --live`: 단위 2종 + 라이브 4종 통과 (`15Q-4` `gemini-4-hydrogen` `16,290ms` 15/15 수치 오염 0건, 무료 `3Q` `gemini-3.8-flash` `4,836ms`, 진단 `gemini-3.8-flash` `9,861ms`, 면접 채점 `gemini-3.8-flash` `6,163ms`)
- **라이브 프로덕션 실측 (`https://korea-resume.com`, 2026-11-16)**:

| 엔드포인트 | HTTP | `usedModel` | `thinkingLevel` | 서버 `durationMs` | 클라이언트 왕복 | 핵심 검증 결과 |
|---|---|---|---|---|---|---|
| `POST /api/diagnose` (무료 진단 1회) | `200` | `gemini-3.8-flash` | `"low"` | `9,166ms` | `10,105ms` | 70점 산출, `freeRemaining: 1` |
| `POST /api/generate` (무료 미리보기 `isFree: true`) | `200` | `gemini-4-hydrogen` | `"medium"` | `32,903ms` | `33,482ms` | **Q1 `505자`**(450~550자 준수), 잠금 3문항, 미검증 수치 `0건` *(1차 타임아웃 42초 상향 덕분에 폴백 없이 완주)* |
| `POST /api/interview/generate` (무료 면접 3Q) | `200` | `gemini-3.8-flash` | `"low"` | `5,116ms` | `5,979ms` | 3문항 정상 생성, 미검증 수치 `0건` |
| `POST /api/interview/evaluate` (`depth: 1` 무료 세션 확인) | `403` | — | — | — | `390ms` | `FREE_FOLLOWUP_LOCKED` 정상 차단 확인 *(채점 Gemini 호출 자체는 위 `--live` `evaluateInterviewAnswerWithAI`로 `gemini-3.8-flash` / `6,163ms` 검증 완료)* |

> **핵심 현장 발견**: 프로덕션 `POST /api/generate` 실측에서 `gemini-4-hydrogen` (`medium`) 4문항 생성이 `32,903ms`에 완료되었습니다. 만약 이번 배포에서 1차 타임아웃을 기존 `30,000ms` 그대로 두었다면 실서비스에서 타임아웃·폴백이 발생했을 구간이며, `42,000ms` 상향(및 `gemini.ts` 35s 클램프 해제)이 실제 프로덕션에서 유효하게 작동함을 확인했습니다.
