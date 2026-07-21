# AI 면접 꼬리질문 시뮬레이터 검증 시나리오

## 시나리오 1: 무료 1회 생성 및 Rate Limit (429) 검증
무료(isFree: true)로 1회 정상 생성 후, 2회차 요청 시 429 에러가 발생하는지 확인합니다.

### 실행 명령어
```bash
for i in 1 2; do
  curl -X POST https://korean-resume-ai.vercel.app/api/interview/generate \
  -H "Content-Type: application/json" \
  -d '{"jobCategory": "IT", "resumeText": "개발 인턴 경험이 있습니다.", "isFree": true}' \
  -s -w "\n-> HTTP %{http_code}\n\n"
done
```

### 실행 결과
```text
{"text":"지원자의 자기소개서 내용이 ‘개발 인턴 경험’이라는 단 한 문장으로 매우 함축적이므로, 일반적인 소프트웨어 엔지니어링 직군 인턴십 환경을 상정하여 날카로운 질문을 설계하였습니다.\n\n***\n\n### [1단계: 상황/행동 사실 확인]\n해당 인턴십 과정에서 본인이 투입되었던 구체적인 프로젝트의 기술 스택과 아키텍처를 설명하고, 본인이 담당한 모듈이 전체 시스템의 데이터 흐름에서 어떤 위치를 차지했는지 기술적으로 명시하십시오. 단순히 '기능을 구현했다'는 수준을 넘어, 본인이 작성한 코드가 실제 운영 환경에 배포되기까지 거친 테스트 과정과 배포 전략(CI/CD 등)에서의 본인의 역할 범위를 정확히 밝히십시오.\n\n### [2단계: 의사결정 근거 검증]\n당시 프로젝트 수행 중 기술적 트레이드오프(Trade-off)를 고민해야 했던 상황을 제시하십시오. 특정 기술을 도입하거나 알고리즘을 선택할 때, 당시 팀 내에서 논의되었던 다른 대안들은 무엇이었으며, 왜 해당 방안이 가장 효율적이라고 판단했는지 논리적 근거를 설명하십시오. 특히, 해당 의사결정이 비즈니스 요구사항(개발 기간, 성능 최적화, 유지보수 용이성 등)과 충돌했을 때 어떻게 타협점을 찾았는지 답변하십시오.\n\n### [3단계: 압박 및 모순 지적]\n인턴 수준에서 경험한 성공적인 결과물은 대개 사수나 시니어 엔지니어의 가이드라인 내에서 이루어진 경우가 많습니다. 만약 본인이 수행한 과제에서 예기치 못한 런타임 오류가 발생했거나, 본인의 설계 결함으로 인해 전체 시스템의 병목 현상이 발생했다면 어떻게 대처했을 것인지 가상 시나리오를 제시하십시오. 또한, 본인의 성과라고 기술한 부분이 실제로는 기존 프레임워크의 기능을 호출하는 것에 불과했거나, 팀 전체의 리소스를 과도하게 사용한 것은 아니었는지 그 신빙성을 입증하십시오."}
-> HTTP 200

{"error":"Too Many Requests. Free tier limit exceeded (1 per 24h)."}
-> HTTP 429
```

---

## 시나리오 2: 미결제 orderId 차단 (403) 검증
Redis에 기록되지 않은 임의의 orderId로 요청 시 403 에러가 발생하는지 확인합니다.

### 실행 명령어
```bash
curl -X POST https://korean-resume-ai.vercel.app/api/interview/generate \
-H "Content-Type: application/json" \
-d '{"jobCategory": "기획", "resumeText": "기획 직무입니다.", "isFree": false, "orderId": "invalid-order-123"}' \
-s -w "\n-> HTTP %{http_code}\n\n"
```

### 실행 결과
```text
{"error":"Forbidden. Invalid payment info or generations exhausted."}
-> HTTP 403
```

---

## 시나리오 3: 유효 결제 건 3회 차감 및 4회차 차단 (403) 검증
Redis에 `order:interview:test-paid-int-001` 값이 `{"paid":true,"remainingGenerations":3}`으로 세팅되어 있다고 가정하고, 4회 연속 호출 시 마지막 요청에서 403이 반환되는지 확인합니다.

### 실행 명령어
```bash
for i in 1 2 3 4; do
  curl -X POST https://korean-resume-ai.vercel.app/api/interview/generate \
  -H "Content-Type: application/json" \
  -d '{"jobCategory": "마케팅", "resumeText": "마케팅 프로젝트 경험", "isFree": false, "orderId": "test-paid-int-001"}' \
  -s -w "\n-> HTTP %{http_code}\n\n"
done
```

### 실행 결과
[이곳에 결과 로그가 수록됩니다]
