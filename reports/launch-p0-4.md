# P0-4 결제 안정성과 결과 재열람 구현 및 검증 보고

- **작성일**: 2026-11-15 (KST)
- **범위**: [P0-4] 1) 생성 실패 시 자동 환불 및 시간 예산 방어, 2) 관리자 결제-생성 불일치/환불 대시보드, 3) 7일 결과 재열람 링크(`/result/[orderId]?token=...`), `.txt` 다운로드 및 Resend 이메일, 4) 결제 UI 카카오톡 채널 문의 링크, 5) 5xx 오류 Webhook/Sentry 알림 훅
- **보안·원칙 준수**:
  - 기존 `src/lib/gemini.ts` 모델 폴백 설정과 `src/lib/siteConfig.ts` / `Footer.tsx` 카카오톡 환경변수 로직을 재사용했습니다.
  - 프로덕션 DB·Redis 조작용 임시 디버그 엔드포인트를 배포하지 않았으며, 본 보고서에 API 키·DB 접속 문자열·실제 비밀번호를 노출하지 않습니다.

---

## 1. 구현 파일 목록

### 신규 파일
- `src/lib/alerts.ts`: 5xx 오류 공통 리포터 (`reportServerError`, `sanitizeErrorText`) — 키/토큰/이메일/DB URL 마스킹 후 `[5XX_ALERT]` 로깅 + `ALERT_WEBHOOK_URL` 및 `SENTRY_DSN` 전송
- `src/lib/toss.ts`: 토스 결제 승인(`confirmTossPayment`) 및 전액 자동 환불(`cancelTossPayment`, `POST /v1/payments/{paymentKey}/cancel`, `Idempotency-Key: auto_refund_{orderId}`)
- `src/lib/redisConfig.ts`: Upstash Redis REST 자격 증명 해석 헬퍼 (`getRedisCredentials`, `requireRedisCredentials`)
- `src/lib/results.ts`: Edge 호환(Web Crypto + 순수 REST `MGET`) 재열람 토큰 생성·SHA-256 해시·상수시간 비교 및 `200`/`403`/`410` 판별 (`verifyAndGetStoredResult`)
- `src/lib/orders.ts`: `order:*` 1년 TTL 원장(`paid` → `generating` → `done`/`refunded`/`failed`), 55초 동시 실행 락, 성공 시에만 잔여 횟수 차감 및 7일 TTL 결과 키(`result:*`) 저장, `usedCount === 0` 실패 시 토스 전액 자동 환불 및 즉시 무효화, `usedCount >= 1` 실패 시 횟수 미차감 복구, 관리자 목록 집계(`listAdminOrders`)
- `src/lib/email.ts`: Resend REST API 결과 링크(7일) + 토스 영수증 안내 발송 (`RESEND_API_KEY` 미설정 시 안내 로그만 남기고 통과)
- `src/lib/paymentHandlers.ts`: `/api/payments/success`·`/api/interview/payment` 및 `/api/generate`·`/api/interview/generate` 공용 라이프사이클 핸들러
- `src/app/api/result/[orderId]/route.ts`: 재열람 JSON(`200`/`403`/`410`) 및 `?format=txt` UTF-8 첨부파일 다운로드
- `src/app/result/[orderId]/page.tsx`, `src/app/result/[orderId]/ResultViewClient.tsx`: 재열람 전용 페이지
- `src/middleware.ts`: `/result/:path*` 접근 시 유효하지 않은 토큰은 실제 `HTTP 403`, 7일 만료 결과는 실제 `HTTP 410` HTML 응답 반환
- `src/app/api/admin/orders/route.ts`, `src/app/admin/page.tsx`, `src/app/admin/AdminOrdersClient.tsx`: `ADMIN_SECRET` 인증 관리자 주문·불일치·환불 조회 API 및 대시보드
- `src/components/PaidResultShareCard.tsx`: `"7일간 열람 가능하니 링크를 저장하세요"` 안내, 재열람 링크 복사, `.txt 파일 다운로드`, 토스 영수증, 카카오톡 채널 링크 공통 카드

### 수정 파일
- `src/lib/gemini.ts`: `PER_ATTEMPT_TIMEOUT_MS = 22_000`, `TOTAL_BUDGET_MS = 45_000` 추가 및 `AbortController` 기반 시도당 22초 제한 + 폴백 모델 1회 재시도
- `src/lib/policy.ts`: `RESULT_TTL_DAYS = 7`, `RESULT_TTL_SECONDS = 604_800`, `normalizeEmail` 추가
- `src/lib/redis.ts`: `redisConfig.ts` 재사용으로 정리
- `src/app/api/payments/success/route.ts`, `src/app/api/interview/payment/route.ts`: `handleConfirmPaymentRequest` 적용
- `src/app/api/generate/route.ts`, `src/app/api/interview/generate/route.ts`: `executePaidGeneration` 적용 (기존 면접 API의 선차감 버그 제거) 및 5xx 알림 연동
- `src/components/PaymentSection.tsx`, `src/components/PaymentSuccessView.tsx`: 이메일 입력란, 보유 이용권 재사용/자동환불 배너, 카카오톡 채널 문의 링크 추가
- `src/app/page.tsx`, `src/app/HomeClient.tsx`, `src/app/interview/page.tsx`, `src/app/interview/InterviewClient.tsx`, `src/app/payments/success/page.tsx`, `src/app/interview/payments/success/page.tsx`: `kakaoChannelUrl` 서버 props 전달, 이메일·자동환불(`AUTO_REFUNDED`) UI 처리, `PaidResultShareCard`·무료 `.txt` 다운로드 연동
- `src/app/robots.ts`: `/api/`, `/admin`, `/result/` 크롤링 차단
- `src/app/privacy/page.tsx`, `src/components/FAQAccordion.tsx`: 이메일 수집 목적, 결과 7일 보관 후 자동 파기 및 Resend 발송 고지 반영

---

## 2. 빌드 및 타입 검증

- `npx tsc --noEmit`: `exit 0` (오류 없음)
- `npm run build` (클린 프로덕션 빌드, `.env.local` 단독 사용): `exit 0`

```text
> korean-resume-tool@1.0.0 build
> next build

   Creating an optimized production build ...
 ✓ Compiled successfully
   Linting and checking validity of types ...
   Collecting page data ...
   Generating static pages (22/22) ...
   Finalizing page optimization ...
   Collecting build traces ...

Route (app)                              Size     First Load JS
├ ○ /                                    7.87 kB         103 kB
├ ƒ /admin                               3.48 kB        90.5 kB
├ ƒ /api/admin/orders                    0 B                0 B
├ ƒ /api/generate                        0 B                0 B
├ ƒ /api/interview/generate              0 B                0 B
├ ƒ /api/interview/payment               0 B                0 B
├ ƒ /api/payments/success                0 B                0 B
├ ƒ /api/result/[orderId]                0 B                0 B
├ ƒ /interview/payments/success          3.59 kB        90.6 kB
├ ƒ /payments/success                    3.59 kB        90.6 kB
├ ƒ /result/[orderId]                    4.18 kB          98 kB
├ ○ /robots.txt                          0 B                0 B
...
ƒ Middleware                             30 kB
```
- Edge Runtime 경고 0건.

---

## 3. 토스페이먼츠 실연동 경계 및 환경 제약 확인 (Raw)

로컬 `.env.local` 및 운영 페이지(`https://korea-resume.com`)에는 현재 상점 전용 토스 테스트/라이브 키 쌍이 설정되어 있지 않으며(운영 번들 `test_gck_EXAMPLETEST`), 토스 공식 문서용 위젯 클라이언트 키(`test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm`)로 위젯 렌더링을 시도한 결과 토스 API가 아래와 같이 `HTTP 401`을 반환하여 브라우저 결제창에서 신규 `paymentKey`를 발급받는 단계가 차단되었습니다.

### 3-1. 위젯 클라이언트 키 실측 응답 (브라우저 및 직접 API 호출)
- 요청: `GET https://api.tosspayments.com/v1/payment-widget/ui-settings` (`customerKey=GUEST` 및 `customerKey=@@ANONYMOUS` 모두 동일)
- 응답 (`HTTP 401`):
```json
{"code":"UNAUTHORIZED_KEY","message":"인증되지 않은 시크릿 키 혹은 클라이언트 키 입니다.","data":null}
```
- 브라우저 콘솔:
  `TossPaymentsError: 인증되지 않은 시크릿 키 혹은 클라이언트 키 입니다.` / `WidgetProductRenderFailError`

### 3-2. 서버 시크릿 키(`test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6`) 실토스 API 연동 응답 (Raw)
백엔드 `/api/payments/success`에서 토스 `/v1/payments/confirm` 실제 호출은 정상 도달함을 확인했습니다.

```text
POST /api/payments/success (missing params): 400 {"message":"Bad Request"}
POST /api/payments/success (live Toss docs key, expired/nonexistent paymentKey): 404 {"message":"결제 시간이 만료되어 결제 진행 데이터가 존재하지 않습니다.","tossError":{"code":"NOT_FOUND_PAYMENT_SESSION","message":"결제 시간이 만료되어 결제 진행 데이터가 존재하지 않습니다."}}
```

> **따라서 본 검증은 다음 두 계층을 명확히 구분해 수행했습니다.**
> 1. **실서버 + 실 Gemini(`gemini-3.8-flash`) + 로컬 Upstash REST 모의 서버(`127.0.0.1:4199`)**: 유료 생성, 1년/7일 TTL, Resend 미설정 통과 로그, `/result/[orderId]` `200`/`403`/`410`, `.txt` 다운로드, 강제 Gemini 실패 시 `usedCount >= 1` 횟수 보존(`503`), `usedCount === 0` 실 토스 취소 호출(`404` -> `502` + `failed` + 5xx Webhook/Sentry 알림), `ADMIN_SECRET` `/api/admin/orders`, UI 화면 검증.
> 2. **격리 단위 E2E(`verify-auto-refund-unit.mjs`)**: 토스 `/v1/payments/confirm` (`200 DONE`)과 `/v1/payments/{paymentKey}/cancel` (`200 CANCELED`) 및 Resend `POST https://api.resend.com/emails` 응답만 로컬 스텁으로 대체하고 실제 `paymentHandlers.ts`/`orders.ts`/`toss.ts`/`email.ts` 로직과 `127.0.0.1:4199` Redis를 실행하여 자동 환불 완료(`HTTP 500`, `AUTO_REFUNDED`, `status: "refunded"`, `paid: false`, `remainingGenerations: 0`) 및 환불 주문 재사용 차단(`HTTP 403`, `ORDER_REFUNDED`) 검증.

---

## 4. 시나리오 ①: 정상 유료 생성, 7일 재열람(200/403/410), .txt 다운로드, Resend (Raw)

### 4-1. 자소서 및 면접 유료 생성 (`http://localhost:3100`, 실 Gemini 호출)
```text
POST /api/generate (paid): 200 {
  "success": true,
  "usedModel": "gemini-3.8-flash",
  "thinkingLevel": "medium",
  "attempts": 1,
  "durationMs": 16724,
  "textLength": 936,
  "order": {
    "orderId": "ord_p04_resume_1",
    "serviceType": "resume",
    "status": "done",
    "usedCount": 1,
    "remainingGenerations": 2,
    "doneAt": "2026-11-15T10:57:21.206Z",
    "resultUrl": "/result/ord_p04_resume_1?token=FLK71ymQgI5HHBRsXcNtHNuwOPoXjZC8",
    "resultExpiresAt": "2026-11-22T10:57:21.206Z",
    "receiptUrl": "https://dashboard.tosspayments.com/receipt/redirection?transactionId=tv_ok_resume_1",
    "emailSent": false
  }
}

POST /api/interview/generate (paid): 200 {
  "success": true,
  "usedModel": "gemini-3.8-flash",
  "thinkingLevel": "medium",
  "attempts": 1,
  "durationMs": 16429,
  "textLength": 956,
  "order": {
    "orderId": "ord_p04_interview_1",
    "serviceType": "interview",
    "status": "done",
    "usedCount": 1,
    "remainingGenerations": 2,
    "doneAt": "2026-11-15T10:57:37.655Z",
    "resultUrl": "/result/ord_p04_interview_1?token=GLuj0VGMkyQE-ilo1Mbyu2CkabiRKkQx",
    "resultExpiresAt": "2026-11-22T10:57:37.655Z",
    "receiptUrl": "https://dashboard.tosspayments.com/receipt/redirection?transactionId=tv_ok_int_1",
    "emailSent": false
  }
}
```
- 서버 로그 (`RESEND_API_KEY` 미설정 시 에러 없이 통과 확인):
```text
[Email] RESEND_API_KEY is not configured. Skipping result email notification (orderId=ord_p04_resume_1).
[Email] RESEND_API_KEY is not configured. Skipping result email notification (orderId=ord_p04_interview_1).
```

### 4-2. 7일 재열람 API / Edge Middleware HTTP 상태 (`200` / `403` / `410`) 및 `.txt` 다운로드
```text
GET /api/result (valid token): 200 {"success":true,"orderId":"ord_p04_resume_1","serviceType":"resume","title":"AI 자기소개서 초안 (공공기관 행정 직무)","text":"**[매뉴얼 정비로 이끈 행정 효율 25%]**\n\n### Situation (상황)..."}
GET /api/result (?format=txt): 200 {
  contentType: 'text/plain; charset=utf-8',
  contentDisposition: 'attachment; filename="resume_ord_p04_resume_1.txt"',
  bodyBytes: 936
}
GET /result page (valid token): 200
GET /api/result (missing token): 403 {"error":"유효하지 않거나 잘못된 재열람 토큰입니다.","code":"FORBIDDEN","reason":"missing_token"}
GET /api/result (wrong token): 403 {"error":"유효하지 않거나 잘못된 재열람 토큰입니다.","code":"FORBIDDEN","reason":"invalid_token"}
GET /result page (wrong token, middleware): 403 true
GET /api/result (expired 7d): 410 {"error":"결과 재열람 기간(7일)이 만료되어 파기되었습니다.","code":"GONE","orderId":"ord_p04_interview_1","expiredAt":"2026-11-15T10:56:37.815Z"}
GET /result page (expired 7d, middleware): 410 true
```

### 4-3. Redis TTL 실측 (1년 주문 원장 / 7일 결과 키)
```text
'order:ord_p04_resume_1': { ttlSeconds: 31535966, status: 'done', usedCount: 1, remaining: 2 }
'order:interview:ord_p04_interview_1': { ttlSeconds: 31535983, status: 'done', usedCount: 1, remaining: 2 }
'result:ord_p04_resume_1': { ttlSeconds: 604783 }
```

### 4-4. `RESEND_API_KEY` 설정 시 발송 페이로드 단위 검증 (`verify-auto-refund-unit.mjs`)
```text
UNIT RESEND EMAIL OUTCOME: { sent: true, id: 'email_unit_123' }
{
  "kind": "resend_email",
  "url": "https://api.resend.com/emails",
  "to": ["scenario1@example.com"],
  "subject": "[Korea Resume AI] AI 자기소개서 초안 재열람 링크(7일 유효) 및 결제 영수증 안내",
  "has7dText": true,
  "hasReceipt": true
}
```

---

## 5. 시나리오 ②: 타임아웃·폴백, 실패 시 횟수 미차감/자동 전액 환불, 5xx 알림 (Raw)

### 5-1. 시도당 22초 제한 + 폴백 1회(총 45초 예산) 단위 검증 (`scratch/test-gemini-budget.mjs`)
- `exit 0`: 400ms 강제 타임아웃 시 `AbortController`로 1차 중단 → `[MODEL_FALLBACK]` 로그 출력 → 폴백 모델(`gemini-3.7-flash`) 재시도로 410ms 내 정상 성공; 두 모델 연속 실패 시 총 예산 내 예외 전파 확인.

### 5-2. `usedCount >= 1` 실패 시 환불 미실행·횟수 보존 / `usedCount === 0` 실 토스 취소 호출 (`http://localhost:3101`)
```text
POST /api/generate on 3101 (usedCount=1 failure): 503 {"error":"일시적인 생성 오류로 실패했습니다. 결제 횟수는 차감되지 않았으니 잠시 후 다시 시도해 주세요.","code":"GENERATION_RETRY_ALLOWED","refunded":false,"order":{"orderId":"ord_p04_retry_gt1","status":"done","usedCount":1,"remainingGenerations":2}}
POST /api/generate on 3101 (usedCount=0 failure hitting live Toss cancel): 502 {"error":"생성 중 오류가 발생했으며 자동 환불 확인이 필요합니다. 고객센터로 주문번호와 함께 문의해 주세요.","code":"AUTO_REFUND_FAILED","refunded":false,"order":{"orderId":"ord_p04_fail_used0","status":"failed"}}
POST /api/generate with refunded orderId: 403 {"error":"이미 자동 환불 처리되어 무효화된 주문입니다.","code":"ORDER_REFUNDED"}
```

### 5-3. 토스 승인(`200 DONE`) → `usedCount === 0` 생성 실패 → 토스 결제취소(`200 CANCELED`) 자동 전액 환불 및 재사용 차단 (`verify-auto-refund-unit.mjs`)
```text
UNIT CONFIRM (stubbed Toss 200 DONE): 200 {"orderId":"ord_unit_refund_1794740307022","serviceType":"resume","status":"paid","amount":4900,"paidAt":"2026-11-15T10:58:27.058Z","remainingGenerations":3}
[MODEL_FALLBACK] Attempt 1 ('gemini-3.8-flash') failed (runtime-error: Simulated Gemini 503 overloaded). Retrying once with 'gemini-3.7-flash' (remainingBudgetMs=45000)...
[5XX_ALERT] {"level":"error","service":"korea-resume-ai","environment":"development","route":"/api/generate","statusCode":500,"orderId":"ord_unit_refund_1794740307022","serviceType":"resume","message":"Error: Simulated Gemini 503 overloaded","extra":{"stage":"gemini_paid_generation","usedCount":"0"},"timestamp":"2026-11-15T10:58:27.073Z"}
UNIT AUTO-REFUND GENERATION (stubbed Toss 200 CANCELED): 500 {
  "error": "생성 오류로 결제가 자동 전액 환불되었습니다",
  "code": "AUTO_REFUNDED",
  "refunded": true,
  "order": {
    "orderId": "ord_unit_refund_1794740307022",
    "status": "refunded",
    "paid": false,
    "remainingGenerations": 0,
    "refundedAt": "2026-11-15T10:58:27.074Z",
    "refundAmount": 4900,
    "refundTransactionKey": "tx_unit_cancel_200",
    "refundReason": "AI 생성 시스템 오류로 인한 자동 전액 환불"
  },
  "tossCancel": {
    "status": "CANCELED",
    "orderId": "ord_unit_auto_refund",
    "cancels": [
      {
        "transactionKey": "tx_unit_cancel_200",
        "cancelAmount": 4900,
        "cancelReason": "AI 생성 시스템 오류로 인한 자동 전액 환불",
        "canceledAt": "2026-11-15T10:58:27.074Z"
      }
    ]
  }
}
UNIT REUSE AFTER REFUND: 403 {"error":"이미 자동 환불 처리되어 무효화된 주문입니다.","code":"ORDER_REFUNDED"}
```
- 토스 취소 API 호출 시 `Idempotency-Key: auto_refund_<orderId>` 및 `{ "cancelReason": "AI 생성 시스템 오류로 인한 자동 전액 환불" }` 전달 확인.

### 5-4. 5xx Webhook & Sentry 수신 실측 (`127.0.0.1:4199/_test/state`)
- `Webhook events count: 3`, `Sentry events count: 3`
```json
{
  "route": "/api/generate",
  "statusCode": 502,
  "orderId": "ord_p04_fail_used0",
  "serviceType": "resume",
  "message": "Critical: Paid generation failed AND automatic Toss refund failed (존재하지 않는 결제 정보 입니다.)",
  "extra": { "stage": "auto_refund_failed" },
  "text": "[Korea Resume AI 5xx Alert] /api/generate (502) | orderId=ord_p04_fail_used0 | Critical: Paid generation failed AND automatic Toss refund failed (존재하지 않는 결제 정보 입니다.)"
}
```
- Sentry `/api/1/store/` 페이로드 역시 `tags.route="/api/generate"`, `tags.status_code="500"` / `"502"`, `extra.orderId` 포함 정상 수신 확인.

---

## 6. 관리자 API (`/api/admin/orders`), `/robots.txt` 및 브라우저 UI 검수 (Raw)

### 6-1. `/api/admin/orders` 인증 및 불일치 필터
```text
GET /api/admin/orders (no secret): 401 {"error":"Unauthorized"}
GET /api/admin/orders (wrong secret): 401 {"error":"Unauthorized"}
GET /api/admin/orders?filter=all: 200 {
  "success": true,
  "filter": "all",
  "summary": { "total": 5, "paid": 0, "generating": 0, "done": 3, "refunded": 1, "failed": 1, "mismatchCount": 1 }
}
GET /api/admin/orders?filter=mismatch: 200 {
  "success": true,
  "filter": "mismatch",
  "orders": [{ "orderId": "ord_p04_fail_used0", "status": "failed", "isMismatch": true }]
}
```

### 6-2. `/robots.txt`
```text
User-Agent: *
Allow: /
Disallow: /api/
Disallow: /admin
Disallow: /result/

Sitemap: https://korea-resume.com/sitemap.xml
```

### 6-3. 브라우저 UI 실검수 결과 (`http://localhost:3100`)
- **`/result/ord_p04_resume_1?token=FLK71ymQgI5HHBRsXcNtHNuwOPoXjZC8`** (`HTTP 200`):
  `"7일간 열람 가능하니 링크를 저장하세요"`, `"남은 생성 횟수: 2회"`, `재열람 링크 복사`(클릭 시 `"링크가 복사되었습니다 ✓"` 전환), `.txt 파일 다운로드`, `토스 영수증 확인 ↗`, `카카오톡 채널 문의 ↗`, 생성 STAR 자소서 본문 정상 표시.
- **`/result/ord_p04_interview_1?token=GLuj0VGMkyQE-ilo1Mbyu2CkabiRKkQx`** (`HTTP 410 Gone`):
  `HTTP 410` 배지, `"결과 재열람 기간(7일)이 만료되었습니다."` 안내 및 카카오톡·이메일 문의 링크 정상 표시.
- **`/admin`** (`HTTP 200`, `ADMIN_SECRET` 입력 인증 후):
  요약 카드(`전체 주문: 6`, `불일치 점검 대상: 1`, `생성 완료(done): 3`, `자동 환불(refunded): 2`, `결제 대기(paid): 0`, `실패(failed): 1`) 및 4종 필터 탭(`전체 보기`, `결제-생성 불일치`, `자동 환불 내역`, `생성 완료`) 정상 동작 확인.
- **결제·문의 UI (`/`, `/interview`, `/payments/success`)**:
  `#resume-customer-email` 및 `#interview-customer-email` 입력란, `PaymentSection`·`PaymentSuccessView`·`Footer` 카카오톡 채널 링크(`BUSINESS_KAKAO_CHANNEL_URL` 설정 시 표시) 렌더링 확인.

---

## 7. Vercel 환경변수 설정 체크리스트 (배포 전 필수 확인)

| 변수명 | 용도 | 비고 |
| --- | --- | --- |
| `ADMIN_SECRET` | `/api/admin/orders` 및 `/admin` 인증 키 | **필수 설정** (미설정 시 `503`) |
| `NEXT_PUBLIC_TOSS_CLIENT_KEY` | 프론트 토스 위젯 클라이언트 키 | 상점 테스트(`test_gck_*`) 또는 라이브(`live_gck_*`) |
| `TOSS_SECRET_KEY` | 서버 결제 승인·자동 환불 시크릿 키 | 상점 테스트(`test_gsk_*`) 또는 라이브(`live_gsk_*`) |
| `BUSINESS_KAKAO_CHANNEL_URL` | 푸터·결제 UI·재열람 페이지 카카오톡 1:1 채널 URL | 채널 개설 URL 입력 시 자동 노출 |
| `RESEND_API_KEY` | 결과 재열람 링크 + 토스 영수증 이메일 자동 발송 | 미설정 시 오류 없이 로그만 기록하고 통과 |
| `RESEND_FROM_EMAIL` | Resend 발신자 주소 | 선택 (기본: `Korea Resume AI <no-reply@korea-resume.com>`) |
| `ALERT_WEBHOOK_URL` | 5xx 장애 Slack/Discord 웹훅 URL | 선택 (로그 `[5XX_ALERT]`는 항상 출력) |
| `SENTRY_DSN` | 5xx 장애 Sentry DSN | 선택 (`ALERT_WEBHOOK_URL`과 병행 가능) |

---

## 8. 최종 검수 후속 보완 5건 반영, 기능별 커밋 분리 및 Raw 검증 로그

### 8-1. 기능별 분리 커밋 내역 (`origin/main` 푸시 완료)
1. `01d2ee8` — `feat(p0-4): base auto-refund, 7-day result re-view, alerts and admin view` (P0-4 기본 구현 베이스)
2. `6f775c6` — `feat(p0-4): atomic Lua generation lock and 180s stuck recovery` (Redis Lua `EVAL` 원자 선차감 + `lock:*` 180초 TTL 잠금 + 180초 이상 고착 주문 자동 복구 및 예약 슬롯 원복)
3. `160e17f` — `feat(p0-4): refund_failed alert/UI handling and 20s/40s Gemini timeout budget` (`GEMINI_CONFIG` 시도당 `20_000ms`/총 `40_000ms` 조정, 토스 취소 실패 시 `refund_failed` 기록 + 5xx 알림 + 에러 코드 비노출 안내 및 카톡·이메일 링크 표시)
4. `5e4fd36` — `security(p0-4): enforce Referrer-Policy and private no-store headers on /result and redact tokens` (`/result/[orderId]`·`/api/result/[orderId]` 전 응답 `Referrer-Policy: no-referrer` + `Cache-Control: private, no-store` 적용 및 로그·알림 토큰 마스킹)
5. `2e76208` — `feat(p0-4): add admin stuck (180s+) order filter and refund_failed summary` (`/api/admin/orders?filter=stuck`·`isOrderStuck`·`/admin` 고착 탭 및 요약 카드 추가)

- Post-edit 검증 빌드: `npx tsc --noEmit` (`exit 0`), `npm run build` (`exit 0`, Static 22페이지 + Middleware `30.6 kB`)
- Gemini 시간 예산 단위 테스트 (`node .../scratch/test-gemini-budget.mjs`): `exit 0` (`PER_ATTEMPT_TIMEOUT_MS: 20000`, `TOTAL_BUDGET_MS: 40000`)

### 8-2. 동시 요청 10건 병렬 `curl` 차단 실측 (`remainingGenerations: 1`, `localhost:3100` + Mock Upstash REST Eval)
```text
curl #01 -> HTTP 200 | {"success":true,"usedModel":"gemini-3.8-flash","order":{"orderId":"ord_race_check_01","status":"done","usedCount":5,"remainingGenerations":0,"resultUrlMasked":"/result/ord_race_check_01?token=***"}}
curl #02 -> HTTP 409 | {"error":"이미 AI 생성이 진행 중입니다. 잠시만 기다려 주세요.","code":"GENERATION_IN_PROGRESS"}
curl #03 -> HTTP 409 | {"error":"이미 AI 생성이 진행 중입니다. 잠시만 기다려 주세요.","code":"GENERATION_IN_PROGRESS"}
curl #04 -> HTTP 409 | {"error":"이미 AI 생성이 진행 중입니다. 잠시만 기다려 주세요.","code":"GENERATION_IN_PROGRESS"}
curl #05 -> HTTP 409 | {"error":"이미 AI 생성이 진행 중입니다. 잠시만 기다려 주세요.","code":"GENERATION_IN_PROGRESS"}
curl #06 -> HTTP 409 | {"error":"이미 AI 생성이 진행 중입니다. 잠시만 기다려 주세요.","code":"GENERATION_IN_PROGRESS"}
curl #07 -> HTTP 409 | {"error":"이미 AI 생성이 진행 중입니다. 잠시만 기다려 주세요.","code":"GENERATION_IN_PROGRESS"}
curl #08 -> HTTP 409 | {"error":"이미 AI 생성이 진행 중입니다. 잠시만 기다려 주세요.","code":"GENERATION_IN_PROGRESS"}
curl #09 -> HTTP 409 | {"error":"이미 AI 생성이 진행 중입니다. 잠시만 기다려 주세요.","code":"GENERATION_IN_PROGRESS"}
curl #10 -> HTTP 409 | {"error":"이미 AI 생성이 진행 중입니다. 잠시만 기다려 주세요.","code":"GENERATION_IN_PROGRESS"}
Race summary: HTTP 200 = 1, HTTP 409 = 9
Post-race request #11 -> HTTP 403 | {"error":"Forbidden. Invalid payment info or generations exhausted.","code":"GENERATIONS_EXHAUSTED"}
```

### 8-3. 180초 고착 주문 필터(`/api/admin/orders?filter=stuck`) 및 자동 복구 실측
```text
GET /api/admin/orders?filter=stuck -> 200 {"filter":"stuck","summary":{"total":2,"paid":0,"generating":1,"stuck":1,"done":1,"refunded":0,"refundFailed":0,"failed":0,"mismatchCount":1},"orders":[{"orderId":"ord_stuck_180_01","status":"generating","isStuck":true,"generatingAt":"2026-11-15T11:23:55.632Z","remainingGenerations":4}]}
POST /api/generate (stuck recovery) -> 200 {"success":true,"usedModel":"gemini-3.8-flash","order":{"orderId":"ord_stuck_180_01","status":"done","usedCount":1,"remainingGenerations":4}}
```

### 8-4. 환불 API 실패(`refund_failed`) 및 5xx 알림 실측 (`localhost:3101` 강제 실패 서버)
```text
POST /api/generate (cancel fail -> 502) -> 502 {"error":"환불 처리 중입니다(영업일 기준 1~2일 내 처리). 지연 시 고객센터로 문의해 주세요.","refundPending":true,"refunded":false,"supportEmail":"ksg0611@gmail.com","kakaoChannelUrl":null,"order":{"orderId":"ord_refund_fail_01","status":"refund_failed"}}
Retry while refund_failed -> 409 {"error":"환불 처리 중입니다(영업일 기준 1~2일 내 처리). 지연 시 고객센터로 문의해 주세요.","code":"REFUND_PENDING","refundPending":true,"refunded":false,"supportEmail":"ksg0611@gmail.com","kakaoChannelUrl":null}
```
- Webhook 5xx Alert 수신 확인: `route="/api/generate"`, `statusCode=502`, `stage="refund_failed"`.

### 8-5. `/result/[orderId]` & `/api/result/[orderId]` `curl -I` 보안 헤더 검증 (로컬 및 프로덕션 실측)

#### 로컬 프로덕션 빌드 서버 (`http://127.0.0.1:3100`)
```text
--- Page /result/[orderId] (valid 200) ---
HTTP/1.1 200 OK
referrer-policy: no-referrer
cache-control: private, no-store
x-robots-tag: noindex, nofollow
Vary: RSC, Next-Router-State-Tree, Next-Router-Prefetch, Accept-Encoding
X-Powered-By: Next.js
Content-Type: text/html; charset=utf-8
Date: Sun, 15 Nov 2026 11:27:16 GMT
Connection: keep-alive
Keep-Alive: timeout=5

--- Page /result/[orderId] (invalid token 403) ---
HTTP/1.1 403 Forbidden
referrer-policy: no-referrer
cache-control: private, no-store
x-robots-tag: noindex, nofollow
content-type: text/html; charset=utf-8
Vary: Accept-Encoding
Date: Sun, 15 Nov 2026 11:27:16 GMT
Connection: keep-alive
Keep-Alive: timeout=5

--- API /api/result/[orderId] (valid 200) ---
HTTP/1.1 200 OK
Referrer-Policy: no-referrer
Cache-Control: private, no-store
X-Robots-Tag: noindex, nofollow
vary: RSC, Next-Router-State-Tree, Next-Router-Prefetch
content-type: application/json
Date: Sun, 15 Nov 2026 11:27:16 GMT
Connection: keep-alive
Keep-Alive: timeout=5

--- API /api/result/[orderId] (wrong token 403) ---
HTTP/1.1 403 Forbidden
Referrer-Policy: no-referrer
Cache-Control: private, no-store
X-Robots-Tag: noindex, nofollow
vary: RSC, Next-Router-State-Tree, Next-Router-Prefetch
content-type: application/json
Date: Sun, 15 Nov 2026 11:27:16 GMT
Connection: keep-alive
Keep-Alive: timeout=5
```
- 로그 및 5xx 알림 페이로드 전수 검사: 원문 재열람 `token` 노출 `0건` 확인.

#### 프로덕션 라이브 배포 서버 (`https://korea-resume.com`, `curl.exe -s -I` 직수신)
```text
$ curl.exe -s -I https://korea-resume.com/result/verify-header-check
HTTP/1.1 403 Forbidden
Cache-Control: private, no-store
Date: Sun, 15 Nov 2026 11:30:15 GMT
Referrer-Policy: no-referrer
Server: Vercel
Strict-Transport-Security: max-age=63072000
X-Robots-Tag: noindex, nofollow
X-Vercel-Id: icn1::4h49m-1794742215176-684d77a89d80

$ curl.exe -s -I https://korea-resume.com/api/result/verify-header-check
HTTP/1.1 403 Forbidden
Age: 0
Cache-Control: private, no-store
Content-Type: application/json
Date: Sun, 15 Nov 2026 11:30:16 GMT
Referrer-Policy: no-referrer
Server: Vercel
Strict-Transport-Security: max-age=63072000
Vary: RSC, Next-Router-State-Tree, Next-Router-Prefetch
X-Matched-Path: /api/result/[orderId]
X-Robots-Tag: noindex, nofollow
X-Vercel-Cache: MISS
X-Vercel-Id: icn1::iad1::br4cw-1794742215662-78aee595bda9
```
