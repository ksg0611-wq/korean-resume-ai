/**
 * 결제 오픈 알림 신청 + Vercel Analytics URL 비식별화 검증
 * 1. validateLaunchNotifyBody: 이메일 형식, 동의 필수(true만 허용), honeypot, source 정규화
 * 2. DDL + INSERT ... ON CONFLICT (PGlite in-memory): 중복 이메일 1행 유지, 동의 버전·일시 기록
 * 3. sanitizeAnalyticsUrl: 쿼리(token·upgradeFrom) 제거, utm_* 유지, /result/{orderId} 치환
 * 4. launch_notify_signup 이벤트가 허용 목록에 포함
 */
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { PGlite } from "@electric-sql/pglite";

const require = createRequire(import.meta.url);
const jitiModule = require(path.resolve(process.cwd(), "node_modules/jiti"));
const createJiti =
  jitiModule.createJiti || (typeof jitiModule === "function" ? jitiModule : jitiModule.default);
const jiti = createJiti(import.meta.url, {
  alias: { "@": path.resolve(process.cwd(), "src") },
  jsx: true,
});

const ln = await jiti.import(path.resolve("src/lib/launchNotify.ts"));
const analytics = await jiti.import(path.resolve("src/lib/analytics.ts"));

// 1. 본문 검증
const v = ln.validateLaunchNotifyBody;
assert.equal(v({ email: "bad", marketingConsent: true }).code, "INVALID_EMAIL");
assert.equal(v({ email: "a@b", marketingConsent: true }).code, "INVALID_EMAIL");
assert.equal(v({ email: "user@example.com" }).code, "CONSENT_REQUIRED");
assert.equal(v({ email: "user@example.com", marketingConsent: "true" }).code, "CONSENT_REQUIRED");
assert.deepEqual(v({ email: " User@Example.com ", marketingConsent: true }), {
  ok: true,
  email: "user@example.com",
  source: "resume",
});
assert.equal(v({ email: "u@example.com", marketingConsent: true, source: "interview" }).source, "interview");
assert.equal(v({ email: "u@example.com", marketingConsent: true, source: "x" }).source, "resume");
assert.deepEqual(v({ email: "bot@example.com", marketingConsent: true, website: "spam" }), { ok: true, honeypot: true });
assert.equal(v(null).code, "INVALID_EMAIL");
console.log("✔ 1. 본문 검증 (이메일·동의 필수·honeypot·source)");

// 2. DB 동작
const db = new PGlite();
await db.exec(ln.DDL_LAUNCH_NOTIFY_SIGNUPS);
await db.exec(ln.DDL_LAUNCH_NOTIFY_SIGNUPS); // 멱등성
const insert = `INSERT INTO launch_notify_signups (email, source, marketing_consent, consent_version)
  VALUES ($1, $2, true, $3)
  ON CONFLICT (email) DO UPDATE SET marketing_consent = true, consent_version = EXCLUDED.consent_version, consented_at = now()`;
await db.query(insert, ["user@example.com", "resume", ln.LAUNCH_NOTIFY_CONSENT_VERSION]);
await db.query(insert, ["user@example.com", "interview", ln.LAUNCH_NOTIFY_CONSENT_VERSION]);
const rows = (await db.query("SELECT email, source, marketing_consent, consent_version, notified_at FROM launch_notify_signups")).rows;
assert.equal(rows.length, 1);
assert.equal(rows[0].marketing_consent, true);
assert.equal(rows[0].source, "resume");
assert.equal(rows[0].consent_version, ln.LAUNCH_NOTIFY_CONSENT_VERSION);
assert.equal(rows[0].notified_at, null);
console.log("✔ 2. DDL 멱등·중복 이메일 1행·동의 버전 기록");

// 3. URL 비식별화 (클라이언트 컴포넌트 파일에서 순수 함수만 추출해 검증)
const fs = await import("node:fs");
const src = fs.readFileSync(path.resolve("src/components/VercelAnalytics.tsx"), "utf8");
const fnSrc = src.match(/export function sanitizeAnalyticsUrl[\s\S]*?\n}\n/)[0]
  .replace("export function", "function")
  .replace("(rawUrl: string): string", "(rawUrl)");
const sanitizeAnalyticsUrl = new Function(`${fnSrc}; return sanitizeAnalyticsUrl;`)();
assert.equal(
  sanitizeAnalyticsUrl("https://korea-resume.com/interview?upgradeFrom=ord_1&token=secret&utm_source=naver"),
  "https://korea-resume.com/interview?utm_source=naver"
);
assert.equal(
  sanitizeAnalyticsUrl("https://korea-resume.com/result/ord_abc123?token=secret#x"),
  "https://korea-resume.com/result/[orderId]"
);
assert.equal(sanitizeAnalyticsUrl("https://korea-resume.com/jobs/306815"), "https://korea-resume.com/jobs/306815");
console.log("✔ 3. 분석 URL에서 토큰·주문번호 제거, utm 유지");

// 4. 이벤트 허용 목록
assert.equal(analytics.sanitizeAnalyticsEventName("launch_notify_signup"), "launch_notify_signup");
console.log("✔ 4. launch_notify_signup 이벤트 허용");

await db.close();
console.log("\n모든 검증 통과");
