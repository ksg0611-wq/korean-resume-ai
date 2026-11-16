import crypto from "crypto";
import { timingSafeEqualStrings } from "@/lib/results";

export const ADMIN_SESSION_COOKIE = "kr_admin_session";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60; // 12시간

export function getConfiguredAdminSecret(): string {
  return (process.env.ADMIN_SECRET || "").trim();
}

export function extractProvidedAdminSecret(req: Request): string {
  const headerSecret = req.headers.get("x-admin-secret")?.trim();
  if (headerSecret) return headerSecret;

  const authHeader = req.headers.get("authorization")?.trim() || "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  return "";
}

export function parseCookieHeader(
  cookieHeader: string | null | undefined,
  name: string
): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";");
  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (!part) continue;
    const eqIdx = part.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = part.slice(0, eqIdx).trim();
    if (key !== name) continue;
    const rawVal = part.slice(eqIdx + 1).trim();
    try {
      return decodeURIComponent(rawVal);
    } catch {
      return rawVal;
    }
  }
  return null;
}

function signAdminPayload(payload: string, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
}

/**
 * ADMIN_SECRET으로 HMAC-SHA256 서명된 관리자 세션 쿠키 토큰 발급
 * - 원문 ADMIN_SECRET은 쿠키에 절대 저장하지 않습니다.
 */
export function createAdminSessionToken(nowMs: number = Date.now()): string | null {
  const secret = getConfiguredAdminSecret();
  if (!secret) return null;
  const nonce = crypto.randomBytes(16).toString("hex");
  const payload = `${nowMs}.${nonce}`;
  const signature = signAdminPayload(payload, secret);
  return `${payload}.${signature}`;
}

/**
 * 관리자 세션 쿠키 서명 및 만료 시간(12시간) 검증
 */
export function verifyAdminSessionToken(
  token: string | null | undefined,
  nowMs: number = Date.now()
): boolean {
  const secret = getConfiguredAdminSecret();
  if (!secret || !token) return false;

  const segments = token.trim().split(".");
  if (segments.length !== 3) return false;

  const [issuedAtStr, nonce, providedSig] = segments;
  if (!issuedAtStr || !nonce || !providedSig) return false;

  const issuedAtMs = Number(issuedAtStr);
  if (!Number.isFinite(issuedAtMs) || issuedAtMs <= 0) return false;
  if (nowMs - issuedAtMs > ADMIN_SESSION_MAX_AGE_SECONDS * 1000) return false;
  if (issuedAtMs - nowMs > 60_000) return false;

  const expectedSig = signAdminPayload(`${issuedAtStr}.${nonce}`, secret);
  return timingSafeEqualStrings(providedSig, expectedSig);
}

/**
 * 요청이 유효한 관리자 권한(헤더 `x-admin-secret` / Bearer 또는 서명된 세션 쿠키)을 갖는지 확인
 */
export function isAdminRequestAuthorized(req: Request): boolean {
  const secret = getConfiguredAdminSecret();
  if (!secret) return false;

  const headerSecret = extractProvidedAdminSecret(req);
  if (headerSecret && timingSafeEqualStrings(headerSecret, secret)) {
    return true;
  }

  const cookieToken = parseCookieHeader(
    req.headers.get("cookie"),
    ADMIN_SESSION_COOKIE
  );
  return verifyAdminSessionToken(cookieToken);
}

/**
 * 토스 라이브 키(`live_`)가 정상 등록된 운영 상태인지 판별 (Fail-Closed)
 * - `TOSS_SECRET_KEY`가 `live_`로 시작할 때만 일반 방문자에게 결제를 허용합니다.
 * - `test_`, 미설정, 빈 값, 오타 등 그 외 모든 경우는 기본 잠금 상태로 동작합니다.
 */
export function isLivePaymentEnabled(): boolean {
  return (process.env.TOSS_SECRET_KEY || "").trim().startsWith("live_");
}

/**
 * 결제 잠금 모드 활성화 여부 (Fail-Closed: `!isLivePaymentEnabled()`)
 * - 라이브 키(`live_`)로 교체되면 별도 코드 수정 없이 즉시 false 반환 (결제 잠금 자동 해제)
 */
export function isPaymentLockMode(): boolean {
  return !isLivePaymentEnabled();
}

/** @deprecated Prefer `isPaymentLockMode()` */
export function isTestPaymentMode(): boolean {
  return isPaymentLockMode();
}

/**
 * Fail-Closed 결제 잠금 모드에서 비관리자 요청 차단 여부
 */
export function isPaymentLockedForRequest(req: Request): boolean {
  if (isLivePaymentEnabled()) {
    return false;
  }
  return !isAdminRequestAuthorized(req);
}
