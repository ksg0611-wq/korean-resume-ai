# 실증 테스트 스크립트 (Validation Protocol)

이 테스트 스크립트는 실제 Vercel 환경에 배포되었다고 가정(`https://your-vercel-domain.com`)하고, 
결제 우회 및 무료 횟수 어뷰징에 대한 보안 로직이 정상 작동하는지 검증하기 위한 `curl` 명령어 세트입니다.

> 💡 **안내:** 테스트를 위해 `<YOUR_VERCEL_DOMAIN>`을 실제 배포된 서버 주소로 변경하여 실행하세요.

---

### 시나리오 1: 무료 엔드포인트 Rate Limiting 어뷰징 방어 검증
**목적:** 동일 IP로 4회 호출 시 4번째 요청에서 HTTP `429 Too Many Requests` 상태 코드 및 에러 메시지가 반환되는지 확인합니다.

```bash
# 1~3회차 호출 (정상 응답 기대)
for i in {1..3}; do
  curl -X POST https://<YOUR_VERCEL_DOMAIN>/api/generate \
    -H "Content-Type: application/json" \
    -d '{"prompt": "마케팅 인턴으로 근무하며 데이터를 분석했습니다."}' \
    -i
done

# 4회차 호출 (429 에러 기대)
curl -X POST https://<YOUR_VERCEL_DOMAIN>/api/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "마케팅 인턴으로 근무하며 데이터를 분석했습니다."}' \
  -i
```
**기대 결과:** 4번째 요청에서 `HTTP/2 429` 및 `{"error": "Too Many Requests. Free tier limit exceeded (3 per 24h)."}` 반환.

---

### 시나리오 2: 임의의 가짜 `orderId` 결제 우회 방어 검증
**목적:** 유효하지 않은 `orderId`("test123")를 넣었을 때, 데이터베이스(Upstash Redis) 조회 로직에 의해 즉각 차단되는지 확인합니다.

```bash
curl -X POST https://<YOUR_VERCEL_DOMAIN>/api/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "개발 프로젝트를 리딩했습니다.", "orderId": "test123"}' \
  -i
```
**기대 결과:** `HTTP/2 403 Forbidden` 및 `{"error": "Forbidden. Invalid payment info or generations exhausted."}` 반환.

---

### 시나리오 3: 유효한 결제 `orderId`의 차감 로직 검증 (생성 횟수 소진)
**목적:** 실제 결제가 완료된 `orderId`(예: `valid-order-456`, `remainingGenerations`가 3으로 설정된 상태)로 4회 호출 시, 4번째 요청에서 소진으로 인해 차단되는지 확인합니다.

*참고: 이 테스트를 실행하기 전 Upstash Redis에 `SET order:valid-order-456 '{"paid":true, "remainingGenerations":3}'`가 세팅되어 있다고 가정합니다.*

```bash
# 1~3회차 호출 (정상 응답 및 횟수 1씩 차감 기대)
for i in {1..3}; do
  curl -X POST https://<YOUR_VERCEL_DOMAIN>/api/generate \
    -H "Content-Type: application/json" \
    -d '{"prompt": "테스트입니다.", "orderId": "valid-order-456"}' \
    -i
done

# 4회차 호출 (잔여 횟수 0으로 인한 403 에러 기대)
curl -X POST https://<YOUR_VERCEL_DOMAIN>/api/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "테스트입니다.", "orderId": "valid-order-456"}' \
  -i
```
**기대 결과:** 4번째 요청에서 `HTTP/2 403 Forbidden` 반환 (데이터베이스에 남은 횟수가 없기 때문).
