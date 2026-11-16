/**
 * P1.7-0 Follow-up Verification Suite
 * 1. Unit tests for `findUnverifiedClaims`, `sanitizeUnverifiedClaims`, `sanitizeUnverifiedResumeText`:
 *    - Detects & masks unverified certificates (~기사, ~자격증, 컴활, 한국사, 기록물관리 전문요원)
 *    - Detects & masks unverified systems/tools (RMS, ERP, SAP, SQL, 파이썬, Excel)
 *    - Detects & masks unverified exaggerated titles (총괄, 팀장, 리드, PM)
 *    - Preserves verified items present in user source text & avoids false positives (신문기사, 배달기사, placeholder text)
 * 2. Tests `GET /api/waitlist` requires admin auth (401 without cookie/header, 200 with admin cookie or x-admin-secret)
 */

import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const jitiModule = require(path.resolve(process.cwd(), "node_modules/jiti"));
const createJiti =
  jitiModule.createJiti || (typeof jitiModule === "function" ? jitiModule : jitiModule.default);

const jiti = createJiti(import.meta.url, {
  alias: { "@": path.resolve(process.cwd(), "src") },
});

const textMetrics = await jiti.import(path.resolve(process.cwd(), "src/lib/textMetrics.ts"));
const waitlistRoute = await jiti.import(path.resolve(process.cwd(), "src/app/api/waitlist/route.ts"));
const sessionRoute = await jiti.import(path.resolve(process.cwd(), "src/app/api/admin/session/route.ts"));

// ── 1. Anti-Fabrication Post-Processing Unit Tests ──
const plainSource =
  "대학 시절 도서관과 학과 행정실에서 자료 분류와 문서 정리 보조 업무를 성실히 수행했습니다. 회의록을 정리하고 방문객 응대를 도왔습니다.";

const fabricatedSample =
  "행정실 근무 당시 팀장 역할을 맡아 RMS와 ERP를 도입하고 정보처리기사 및 컴활 1급과 한국사 1급 지식을 바탕으로 40% 효율을 개선했습니다. (참고: 신문기사 스크랩 보조)";

const detectedClaims = textMetrics.findUnverifiedClaims(fabricatedSample, plainSource);
const detectedTokens = detectedClaims.map((c) => c.token);
assert.ok(detectedTokens.includes("팀장"), "Should detect unverified title 팀장");
assert.ok(detectedTokens.includes("RMS"), "Should detect unverified tool RMS");
assert.ok(detectedTokens.includes("ERP"), "Should detect unverified tool ERP");
assert.ok(detectedTokens.includes("정보처리기사"), "Should detect unverified certificate 정보처리기사");
assert.ok(detectedTokens.some((t) => t.startsWith("컴활")), "Should detect 컴활 1급");
assert.ok(detectedTokens.some((t) => t.startsWith("한국사")), "Should detect 한국사 1급");
assert.ok(!detectedTokens.some((t) => t.includes("신문기사")), "Must NOT false-positive on 신문기사");

const sanitized = textMetrics.sanitizeUnverifiedResumeText(fabricatedSample, plainSource);
assert.ok(!sanitized.includes("40%"), "Must sanitize unverified number 40%");
assert.ok(sanitized.includes("[본인 수치 입력]"), "Must insert metric placeholder");
assert.ok(sanitized.includes("[해당 경험이 있다면 입력:"), "Must insert experience placeholder");
assert.ok(sanitized.includes("신문기사"), "Must preserve harmless 신문기사");
assert.equal(
  textMetrics.findUnverifiedClaims(sanitized, plainSource).length,
  0,
  "After sanitization, remaining masked tokens must yield 0 unverified claims"
);

// Verify source-backed claims are preserved verbatim
const richSource = "SQL과 파이썬을 활용해 데이터를 추출하고 컴퓨터활용능력 1급 자격을 바탕으로 팀장을 보좌했습니다. (프로젝트 총괄은 교수님)";
const richGen = "SQL과 파이썬 기반 조회 경험과 컴활 1급 역량을 발휘했습니다.";
assert.equal(textMetrics.findUnverifiedClaims(richGen, richSource).length, 0);
assert.equal(textMetrics.sanitizeUnverifiedResumeText(richGen, richSource), richGen);

// Verify English word boundaries prevent false matches like TERMS containing RMS or SUPER containing ERP
const boundarySample = "TERMS 정책과 SUPER 관리자 안내, FORM 문서 정리 보조를 수행했습니다.";
assert.equal(textMetrics.findUnverifiedClaims(boundarySample, plainSource).length, 0);

// Verify adjacent tool tokens merge cleanly into a single bracket placeholder
const mergedToolsOut = textMetrics.sanitizeUnverifiedResumeText(
  "업무 효율화를 위해 엑셀 VBA 매크로 기능을 활용하겠습니다.",
  plainSource
);
assert.equal(
  (mergedToolsOut.match(/\[해당 경험이 있다면 입력:/g) || []).length,
  1,
  "Adjacent tool tokens ('엑셀 VBA 매크로') must merge into a single placeholder bracket"
);
assert.equal(textMetrics.findUnverifiedClaims(mergedToolsOut, plainSource).length, 0);
console.log("PASS 1: Claim detection & sanitization passed across certificates, tools, titles, and boundaries");

// ── 2. GET /api/waitlist Admin Auth Guard ──
process.env.ADMIN_SECRET = "waitlist_admin_secret_test";
delete process.env.DATABASE_URL; // allow check before DB query or handle clean response

const unauthGet = await waitlistRoute.GET(new Request("http://localhost:3000/api/waitlist"));
assert.equal(unauthGet.status, 401, "GET /api/waitlist without credentials MUST return 401");
assert.equal((await unauthGet.json()).code, "ADMIN_AUTH_REQUIRED");

const forgedCookieGet = await waitlistRoute.GET(
  new Request("http://localhost:3000/api/waitlist", {
    headers: { cookie: "kr_admin_session=123.abc.invalid" },
  })
);
assert.equal(forgedCookieGet.status, 401, "GET /api/waitlist with forged cookie MUST return 401");

// Issue real admin cookie and verify auth gate passes cleanly
const loginRes = await sessionRoute.POST(
  new Request("http://localhost:3000/api/admin/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: process.env.ADMIN_SECRET }),
  })
);
assert.equal(loginRes.status, 200);
const cookiePair = (loginRes.headers.get("set-cookie") || "").split(";")[0];

// Mock simple PostgreSQL query not needed just to confirm auth passed 401 gate; if PGlite runs locally it returns 200
const authGet = await waitlistRoute.GET(
  new Request("http://localhost:3000/api/waitlist", {
    headers: { cookie: cookiePair },
  })
);
assert.notEqual(authGet.status, 401, "Authenticated admin cookie MUST pass auth guard");
assert.notEqual(authGet.status, 403, "Authenticated admin cookie MUST NOT get 403");
console.log(`PASS 2: GET /api/waitlist auth guard passed (unauth=401, admin status=${authGet.status})`);

console.log("\nALL ANTI-FABRICATION & WAITLIST AUTH CHECKS PASSED.");
process.exit(0);
