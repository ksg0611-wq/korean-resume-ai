/**
 * 결제 오픈 알림 신청 (결제 잠금 기간 한정)
 *
 * - 이메일 + 광고성 정보 수신 동의(필수 체크) + 동의 시각만 저장합니다.
 * - 「정보통신망법」 제50조: 광고성 정보는 사전 동의를 받은 경우에만 발송하며,
 *   동의 일시·동의 문구 버전을 함께 보관해 입증할 수 있게 합니다.
 * - 정식 결제 오픈 안내 1회 발송 후 또는 동의 철회 요청 시 파기합니다.
 */

export const LAUNCH_NOTIFY_CONSENT_VERSION = "2026-11-24";

export const LAUNCH_NOTIFY_CONSENT_TEXT =
  "[필수] 결제 기능 오픈 안내(광고성 정보)를 이메일로 받는 데 동의합니다. 오픈 안내 1회 발송 후 이메일은 파기되며, 언제든 수신을 거부할 수 있습니다.";

export const LAUNCH_NOTIFY_SOURCES = ["resume", "interview"] as const;
export type LaunchNotifySource = (typeof LAUNCH_NOTIFY_SOURCES)[number];

export const DDL_LAUNCH_NOTIFY_SIGNUPS = `
  CREATE TABLE IF NOT EXISTS launch_notify_signups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(254) NOT NULL UNIQUE,
    source VARCHAR(16) NOT NULL DEFAULT 'resume',
    marketing_consent BOOLEAN NOT NULL,
    consent_version VARCHAR(16) NOT NULL,
    consented_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    notified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  ALTER TABLE launch_notify_signups ENABLE ROW LEVEL SECURITY;
`;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeLaunchNotifyEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length < 6 || email.length > 254) return null;
  return EMAIL_REGEX.test(email) ? email : null;
}

export function sanitizeLaunchNotifySource(value: unknown): LaunchNotifySource {
  return value === "interview" ? "interview" : "resume";
}

export type LaunchNotifyValidation =
  | { ok: true; email: string; source: LaunchNotifySource }
  | { ok: false; status: number; code: string; message: string };

/**
 * 요청 본문 검증 (DB 접근 없음 — 단위 테스트 대상)
 * - website: 봇 차단용 숨김 필드(honeypot). 값이 있으면 저장하지 않고 성공처럼 응답합니다.
 */
export function validateLaunchNotifyBody(body: unknown): LaunchNotifyValidation | { ok: true; honeypot: true } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

  if (typeof b.website === "string" && b.website.trim() !== "") {
    return { ok: true, honeypot: true };
  }

  const email = normalizeLaunchNotifyEmail(b.email);
  if (!email) {
    return { ok: false, status: 400, code: "INVALID_EMAIL", message: "올바른 이메일 주소를 입력해 주세요." };
  }

  if (b.marketingConsent !== true) {
    return {
      ok: false,
      status: 400,
      code: "CONSENT_REQUIRED",
      message: "오픈 안내를 받으려면 수신 동의에 체크해 주세요.",
    };
  }

  return { ok: true, email, source: sanitizeLaunchNotifySource(b.source) };
}
