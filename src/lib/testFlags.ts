import { timingSafeEqualStrings } from "@/lib/results";

/**
 * 6번 시나리오(결제 후 생성 강제 실패 -> 자동 전액 환불) 검증용 이중 잠금 테스트 플래그.
 * 반드시 아래 세 조건을 모두 만족할 때만 활성화되며, 일반/운영 요청에서는 항상 false를 반환합니다:
 * 1) 서버 환경변수 TOSS_SECRET_KEY가 반드시 토스 테스트 키("test_")로 시작
 * 2) 요청 헤더 `x-admin-secret`이 서버 `ADMIN_SECRET`과 타이밍 세이프 비교로 일치
 * 3) 요청 본문 `forceFail === true` 또는 헤더 `x-force-fail` ("1" | "true") 명시
 */
export function isForceFailAuthorized(
  req: Request,
  bodyForceFail?: unknown
): boolean {
  const wantsForceFail =
    bodyForceFail === true ||
    req.headers.get("x-force-fail") === "1" ||
    req.headers.get("x-force-fail") === "true";
  if (!wantsForceFail) {
    return false;
  }

  const tossSecret = (process.env.TOSS_SECRET_KEY || "").trim();
  if (!tossSecret.startsWith("test_")) {
    return false;
  }

  const configuredAdminSecret = (process.env.ADMIN_SECRET || "").trim();
  const providedAdminSecret = (req.headers.get("x-admin-secret") || "").trim();
  if (!configuredAdminSecret || !providedAdminSecret) {
    return false;
  }

  return timingSafeEqualStrings(providedAdminSecret, configuredAdminSecret);
}
