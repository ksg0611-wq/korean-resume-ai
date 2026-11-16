# P1.6 Phase B · Phase C 구현·배포 및 검증 보고서

- **작성일**: 2026-11-16
- **프로덕션 URL**: `https://korea-resume.com` (`/`, `/interview`, `/jobs/[sn]`, `/result/[orderId]`, `/admin`)
- **배포 커밋 (`origin/main`)**:
  - **Phase B**:
    - `0656de8` — `feat(p1.6-b): add 7900 bundle and +3000 upgrade backend security and APIs`
    - `3ee1760` — `feat(p1.6-b): add bundle add-on UI, +3000 upgrade flow, and tests`
  - **Phase C**:
    - `a38d1ddb` — `feat(p1.6-c): add self-intro rubric, script API, and job posting context backend`
    - `89a8847` — `feat(p1.6-c): add 1-minute self-intro studio UI, job CTA, and tests` (Vercel 프로덕션 배포 완료)

---

## 1. Phase B 구현 요약 (`7,900원` 통합 패키지 · `+3,000원` 업그레이드 · 결제 보안)

1. **홈 결제 `"면접 연습 추가 (+3,000원)"` & 연동 면접권 자동 발급**:
   - `PaymentSection.tsx` / `HomeClient.tsx` / `PackageComparisonTable.tsx`: 체크박스 토글 시 Toss 결제 위젯 금액(`paymentMethodsWidget.updateAmount`)이 `4,900원 ↔ 7,900원` 즉시 동기화.
   - `saveConfirmedOrder` (`orders.ts`): `planType: "bundle"` (`7,900원`) 결제 승인 시 자소서 원장 `order:{orderId}`와 쌍을 이루는 연동 면접 이용권 `order:interview:int_{orderId}` (`planType: "bundle_companion"`, `initialGenerations: 1`)를 함께 발급·인덱싱.
   - 홈 완성 화면(`HomeClient.tsx`) 및 7일 재열람 화면(`/result/[orderId]`)에서 `"포함된 AI 면접 시뮬레이터(15문항·45회) 시작하기 →"` 버튼으로 추가 결제 없이 즉시 면접 시작(`/api/interview/context?bundleFrom=...` 원문 자동 로드).
   - **오류·부분실패 정책 준수**: 자소서 생성 전(`usedCount === 0`) 통합 결제 실패 시 연동 면접권도 함께 `"refunded"` 무효화; 자소서 제공 후 연동 면접권(`bundle_companion`) 초기 생성 실패 시 `7,900원` 전액 취소나 자동 3,000원 부분취소 없이 `status: "interview_pending"` 기록·무료 재시도 허용 및 `/admin` 불일치 목록에 노출.

2. **자소서 구매자 `+3,000원` 면접 업그레이드 & 결제 조작 차단**:
   - `HomeClient.tsx` & `/result/[orderId]` (7일 만료 `410` 화면 포함)에서 `/interview?upgradeFrom={baseOrderId}&token={resultToken}` 진입.
   - `GET /api/interview/context`: 7일 내 유효 시 `result:{baseOrderId}` 원문 자동 로드 + `3,000원` 할인 적용; 7일 만료(`result:*` 삭제) 후에도 1년 보관 원장 `order:{baseOrderId}` 기준으로 할인 자격은 유지하고 원문 재입력 안내(`resumeExpired: true`).
   - **서버 3중 방어 (`/api/payments/prepare` · `/api/interview/payment` · `paymentHandlers.ts`)**:
     - `validateInterviewUpgradeEligibility`로 ① 유료 실존 여부 ② 미환불 ③ 자소서 단독 주문(`resume_single`) 여부 ④ `upgradedToInterviewOrderId` 1주문 1회 제한 ⑤ `resultTokenHash`(상수 시간 비교) 또는 구매 이메일 소유권 검증.
     - 미인가 `3,000원` 요청 또는 `payment_intent` 금액 불일치는 Toss 승인 전 `403` 차단, 승인 응답 금액 조작 시 즉시 `cancelTossPayment` 자동 취소 후 `403` 반환.
   - `/admin` (`AdminOrdersClient.tsx`): 주문별 `planType` 배지 및 `linkedInterviewOrderId` / `upgradedToInterviewOrderId` / `baseOrderId` 관계 표시 추가.

---

## 2. Phase C 구현 요약 (`1분 자기소개 대본 모드` · `/jobs/[sn]` 공고 연동)

1. **`1분 자기소개 대본 생성·채점 모드` (`self_intro`)**:
   - `POST /api/interview/self-intro`: 유료 세션 전용으로 지원자 자소서(및 선택 공고)를 1분 발화 적정 분량(**270~320자**)의 3단 구술 대본으로 생성(`gemini-4-hydrogen`, `low`), `sanitizeUnverifiedNumbers` 적용, 발표 팁 3줄 포함 및 세션/7일 대비 노트(`PART 0. 1분 자기소개 대본 및 평가`) 자동 동기화(무료 세션은 `403 FREE_SELF_INTRO_LOCKED`).
   - `calculateConcisenessScore(..., "self_intro")` (`interviewRubric.ts`) & `POST /api/interview/evaluate`: 입력 길이 `80~600자` 허용, **250~330자(약 48~63초)** = 15점 만점 / `200~249·331~400자` = 11점 / 기타 = 7점 산출 및 `estimatedSpeechSeconds` 표시. 채점 후 `self_intro` 전용 1~3단계 동적 꼬리질문 연쇄 및 `result:*` 대비 노트(`.txt` 포함) 반영.
   - `InterviewSimulatorWorkspace.tsx`: 상단 모드 전환 탭(`예상 질문·꼬리질문` vs `1분 자기소개 대본`), 실시간 글자수·예상 발화초 카운터, 대본 편집·채점·꼬리질문 UI 통합.

2. **`/jobs/[sn]` 공고 상세 `"이 공고 면접 준비 →"` CTA & 서버 DB 컨텍스트 주입**:
   - `JobDetailAction.tsx`: `/interview?sn={sn}` 바로가기 CTA 추가.
   - `GET /api/interview/context?sn={sn}` & `POST /api/interview/generate` (`jobSn`): 클라이언트 쿼리 문자열을 신뢰하지 않고 서버에서 `getJobDetail(sn)`을 직접 조회해 기관명·공고명·NCS 분야·자격요건·우대사항을 질문 생성/대본/채점 프롬프트와 세션 배지에 반영(`INTERVIEW_JOB_CATEGORIES` 정확 값 매핑 보정 포함).

---

## 3. 자동 검증 · 빌드 · 라이브 프로덕션 점검 결과

| 검증 항목 | 범위 / 환경 | 실행 결과 |
|---|---|---|
| `npx tsc --noEmit` | 전체 TypeScript 정적 검사 | **Exit 0** (오류 0건) |
| `npm run build` | Next.js 14 프로덕션 빌드 (28개 정적/동적 라우트) | **Exit 0** (`/api/interview/context`, `/api/interview/self-intro`, `/interview`, `/jobs/[sn]`, `/result/[orderId]` 전체 컴파일) |
| `Select-String ... -Pattern "합격"` | Phase B·C 변경 UI 파일 전체 | **0건** (서비스·결제 화면 과장 문구 없음) |
| `node scripts/verify-p1-6-b.mjs` | 인프로세스 Mock Redis/Lua + Mock Toss 기반 전 흐름 | **통과**: 7,900원 통합(`int_ord_bundle_1` 자동발급·컨텍스트 로드·`interview_pending` 및 `/admin` 노출·미사용 전액환불 연동), +3,000원 업그레이드 공격 5종 차단(`403` 및 `cancelTossPayment`), 7일 만료 후 할인 유지, 환불 시 자격 복구 |
| `node scripts/verify-p1-6-c.mjs --live` | 실호출 Gemini API (`4-hydrogen` / `3.8-flash`) + Mock Redis | **통과**: 루브릭(`285자`=15점), 무료 생성 `403` 차단, 유료 1분 대본 생성(`gemini-4-hydrogen`, `285자 ~55초`, 미검증 수치 `0건`), 채점(`gemini-3.8-flash`, `82점`) + 꼬리질문 + `PART 0` 노트 `.txt` 동기화 |
| 라이브 프로덕션 스모크 (`https://korea-resume.com`) | 배포 `89a8847` 대상 실서버 HTTPS 확인 | **통과**: 홈 통합 UI 노출, `/interview` 로드, `/jobs/306815` CTA 및 `/api/interview/context?sn=306815`(`200`, `[해양수산과학기술진흥원]`), `/prepare` 미인가 업그레이드 `403`, `/interview/payment` 무단 `3000원` `403`, `/self-intro` 미존재 세션 `410` |
