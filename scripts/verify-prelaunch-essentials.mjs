/**
 * Pre-Launch Essentials Verification Suite
 * 1. Conversion analytics (8 events: diagnose_run, draft_run, checkout_click, payment_success, payment_fail, job_cta_click, interview_free_run, launch_notify_signup)
 *    - Validates strict allowlist (source: blog/jobs/direct, planType)
 *    - Ensures zero PII (email, text, IP) leaks into Redis keys or responses
 *    - Verifies Redis counters `analytics:funnel:YYYY-MM-DD:*` increment & `/api/admin/orders` returns `analyticsFunnel`
 * 2. AI draft review notice ("AI가 생성한 초안이며 제출 전 본인 검토가 필요합니다")
 *    - Verifies `formatFullPackageText`, `formatInterviewNoteText`, `withAiDraftNoticeText`, `sendResultEmail` (HTML & text)
 *    - Verifies `/api/result/[orderId]?format=txt` returns the notice even for legacy results
 *    - Verifies `/privacy`, `HomeClient.tsx`, `InterviewClient.tsx`, `ResultViewClient.tsx`, `PaidResultShareCard.tsx` contain the notice/disclosures
 */

import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const jitiModule = require(path.resolve(process.cwd(), "node_modules/jiti"));
const createJiti =
  jitiModule.createJiti || (typeof jitiModule === "function" ? jitiModule : jitiModule.default);

class MockUpstashStore {
  constructor() {
    this.kv = new Map();
    this.zsets = new Map();
  }
  _prune(k) {
    const item = this.kv.get(k);
    if (item && item.expiresAt !== null && item.expiresAt <= Date.now()) {
      this.kv.delete(k);
      return null;
    }
    return item || null;
  }
  getRaw(k) {
    const it = this._prune(k);
    return it ? it.value : null;
  }
  setRaw(k, v, exSec = null) {
    const expiresAt = exSec && Number(exSec) > 0 ? Date.now() + Number(exSec) * 1000 : null;
    this.kv.set(k, { value: v, expiresAt });
    return "OK";
  }
  exec(cmdArr) {
    const cmd = String(cmdArr[0]).toUpperCase();
    const args = cmdArr.slice(1);
    if (cmd === "GET") return this.getRaw(String(args[0]));
    if (cmd === "MGET") return args.map((k) => this.getRaw(String(k)));
    if (cmd === "SET") {
      const key = String(args[0]);
      const val = args[1];
      let ex = null;
      let nx = false;
      for (let i = 2; i < args.length; i++) {
        const flag = String(args[i]).toUpperCase();
        if (flag === "EX" && args[i + 1] !== undefined) ex = Number(args[++i]);
        else if (flag === "NX") nx = true;
      }
      if (nx && this.getRaw(key) !== null) return null;
      return this.setRaw(key, val, ex);
    }
    if (cmd === "INCR") {
      const key = String(args[0]);
      const existing = this._prune(key);
      const next = Number(existing?.value ?? 0) + 1;
      this.kv.set(key, { value: next, expiresAt: existing?.expiresAt ?? null });
      return next;
    }
    if (cmd === "EXPIRE") {
      const key = String(args[0]);
      const item = this._prune(key);
      if (!item) return 0;
      item.expiresAt = Date.now() + Number(args[1]) * 1000;
      return 1;
    }
    if (cmd === "ZRANGE") {
      const z = this.zsets.get(String(args[0])) || [];
      return z.map((e) => e.member);
    }
    if (cmd === "ZADD") {
      const key = String(args[0]);
      const z = this.zsets.get(key) || [];
      const score = Number(args[1]);
      const member = String(args[2]);
      const idx = z.findIndex((e) => e.member === member);
      if (idx >= 0) z[idx].score = score;
      else z.push({ score, member });
      z.sort((a, b) => a.score - b.score);
      this.zsets.set(key, z);
      return 1;
    }
    return null;
  }
}

const store = new MockUpstashStore();
const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const raw = Buffer.concat(chunks).toString("utf8");
    const body = raw ? JSON.parse(raw) : [];
    const pathname = (req.url || "/").split("?")[0];
    if (pathname === "/pipeline") {
      const results = (Array.isArray(body) ? body : []).map((cmd) => ({
        result: store.exec(cmd),
      }));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(results));
      return;
    }
    const result = store.exec(Array.isArray(body) ? body : []);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ result }));
  });
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();

process.env.UPSTASH_REDIS_REST_URL = `http://127.0.0.1:${port}`;
process.env.UPSTASH_REDIS_REST_TOKEN = "mock_upstash_token";
process.env.ADMIN_SECRET = "verify_prelaunch_secret";
process.env.TOSS_SECRET_KEY = "test_sk_prelaunch_mock";
process.env.RESEND_API_KEY = "re_mock_key_for_email_capture";

const jiti = createJiti(import.meta.url, {
  alias: { "@": path.resolve(process.cwd(), "src") },
});

const policy = await jiti.import(path.resolve(process.cwd(), "src/lib/policy.ts"));
const analytics = await jiti.import(path.resolve(process.cwd(), "src/lib/analytics.ts"));
const analyticsRoute = await jiti.import(
  path.resolve(process.cwd(), "src/app/api/analytics/event/route.ts")
);
const adminOrdersRoute = await jiti.import(
  path.resolve(process.cwd(), "src/app/api/admin/orders/route.ts")
);
const packageGen = await jiti.import(
  path.resolve(process.cwd(), "src/lib/packageGenerator.ts")
);
const interviewSession = await jiti.import(
  path.resolve(process.cwd(), "src/lib/interviewSession.ts")
);
const emailLib = await jiti.import(path.resolve(process.cwd(), "src/lib/email.ts"));
const resultApiRoute = await jiti.import(
  path.resolve(process.cwd(), "src/app/api/result/[orderId]/route.ts")
);
const resultsLib = await jiti.import(
  path.resolve(process.cwd(), "src/lib/results.ts")
);

try {
  // ── 1. Conversion Analytics & Zero-PII Verification ──
  const badRes = await analyticsRoute.POST(
    new Request("http://localhost/api/analytics/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "arbitrary_evil_event", source: "blog" }),
    })
  );
  assert.equal(badRes.status, 400, "Invalid event name must return 400");

  const testCases = [
    { event: "job_cta_click", source: "jobs", planType: "resume_single" },
    { event: "diagnose_run", source: "blog", planType: "free" },
    { event: "draft_run", source: "jobs", planType: "free" },
    { event: "interview_free_run", source: "direct", planType: "free" },
    { event: "checkout_click", source: "jobs", planType: "bundle" },
    { event: "payment_success", source: "jobs", planType: "bundle" },
    { event: "payment_fail", source: "blog", planType: "interview_single" },
    { event: "launch_notify_signup", source: "direct", planType: "unknown" },
  ];

  let recordedDate = "";
  for (const tc of testCases) {
    const res = await analyticsRoute.POST(
      new Request("http://localhost/api/analytics/event", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "203.0.113.77",
        },
        body: JSON.stringify({
          ...tc,
          // Attempt PII injection — must be strictly ignored
          email: "pii_leak@example.com",
          text: "민감한 자소서 원문 테스트",
          name: "홍길동",
          ip: "203.0.113.77",
        }),
      })
    );
    assert.equal(res.status, 200, `${tc.event} should return 200`);
    const json = await res.json();
    assert.equal(json.recorded, true, `${tc.event} must persist to Redis`);
    recordedDate = json.date;
    assert.equal(JSON.stringify(json).includes("pii_leak"), false, "Must strip PII");
  }

  // Ensure zero PII strings exist in ANY Redis key or value
  for (const [k, v] of store.kv.entries()) {
    const dump = `${k}:${JSON.stringify(v.value)}`;
    assert.ok(!dump.includes("pii_leak"), `PII leaked into Redis key ${k}`);
    assert.ok(!dump.includes("홍길동"), `Name leaked into Redis key ${k}`);
    assert.ok(!dump.includes("203.0.113.77"), `IP leaked into Redis key ${k}`);
  }

  // Verify /api/admin/orders aggregates analyticsFunnel cleanly
  const adminRes = await adminOrdersRoute.GET(
    new Request(`http://localhost/api/admin/orders?analyticsDate=${recordedDate}`, {
      headers: { "x-admin-secret": "verify_prelaunch_secret" },
    })
  );
  assert.equal(adminRes.status, 200);
  const adminData = await adminRes.json();
  assert.ok(adminData.analyticsFunnel, "Admin API must return analyticsFunnel");
  assert.equal(adminData.analyticsFunnel.date, recordedDate);
  assert.equal(adminData.analyticsFunnel.totalsBySource.jobs, 4);
  assert.equal(adminData.analyticsFunnel.totalsBySource.blog, 2);
  assert.equal(adminData.analyticsFunnel.totalsBySource.direct, 2);
  for (const ev of analytics.ANALYTICS_EVENTS) {
    assert.equal(
      adminData.analyticsFunnel.totalsByEvent[ev],
      1,
      `Event ${ev} count should equal 1`
    );
  }
  assert.equal(adminData.analyticsFunnel.conversionRates.checkoutToSuccessPct, 100);
  console.log("PASS 1: All 8 funnel events, source/plan breakdowns, zero-PII & /api/admin/orders aggregation verified");

  // ── 2. AI Draft Review Notice across .txt formatters, email, API, and UI files ──
  const notice = policy.AI_DRAFT_REVIEW_NOTICE;
  assert.equal(notice, "AI가 생성한 초안이며 제출 전 본인 검토가 필요합니다");

  const pkgText = packageGen.formatFullPackageText({
    jobTitle: "공공기관 일반행정",
    items: [
      { id: "q1", order: 1, title: "1. 지원동기", body: "본문 테스트", charCount: 6, byteCount: 16 },
    ],
    interviewQuestions: [],
  });
  assert.ok(pkgText.includes(notice), "formatFullPackageText must include AI notice");

  const ivText = interviewSession.formatInterviewNoteText({
    orderId: "int_test",
    jobCategory: "일반행정",
    totalQuestions: 1,
    answeredCount: 0,
    maxEvaluations: 45,
    usedEvaluations: 0,
    remainingEvaluations: 45,
    updatedAt: new Date().toISOString(),
    entries: [],
  });
  assert.ok(ivText.includes(notice), "formatInterviewNoteText must include AI notice");

  // Verify idempotency of withAiDraftNoticeText
  const once = policy.withAiDraftNoticeText("테스트 결과");
  const twice = policy.withAiDraftNoticeText(once);
  assert.equal(once, twice, "withAiDraftNoticeText must not duplicate notice");

  // Verify legacy saved result:* without notice still gets notice on GET /api/result/[orderId]?format=txt
  const legacyTokenHash = await resultsLib.hashResultToken("tok_legacy_123");
  store.setRaw("order:order_legacy_txt", {
    orderId: "order_legacy_txt",
    serviceType: "resume",
    status: "done",
    amount: 4900,
    totalGenerations: 3,
    usedCount: 1,
    remainingGenerations: 2,
    resultToken: "tok_legacy_123",
    resultTokenHash: legacyTokenHash,
    resultExpiresAt: new Date(Date.now() + 86400_000).toISOString(),
  });
  store.setRaw("result:order_legacy_txt", {
    orderId: "order_legacy_txt",
    token: "tok_legacy_123",
    tokenHash: legacyTokenHash,
    serviceType: "resume",
    title: "레거시 결과",
    text: "기존 저장 본문입니다.",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400_000).toISOString(),
  });

  const txtRes = await resultApiRoute.GET(
    new Request("http://localhost/api/result/order_legacy_txt?token=tok_legacy_123&format=txt"),
    { params: { orderId: "order_legacy_txt" } }
  );
  assert.equal(txtRes.status, 200);
  const txtBody = await txtRes.text();
  assert.ok(txtBody.includes(notice), "GET /api/result/[orderId]?format=txt must include AI notice");

  // Verify email HTML & plain text via Resend fetch interception
  let capturedEmailPayload = null;
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("api.resend.com/emails")) {
      capturedEmailPayload = JSON.parse(init.body);
      return new Response(JSON.stringify({ id: "re_test_123" }), { status: 200 });
    }
    return origFetch(url, init);
  };
  const emailOut = await emailLib.sendResultEmail({
    to: "applicant@example.com",
    orderId: "order_email_chk",
    serviceType: "resume",
    resultUrl: "/result/order_email_chk?token=abc",
    expiresAt: new Date().toISOString(),
  });
  globalThis.fetch = origFetch;
  assert.equal(emailOut.sent, true);
  assert.ok(capturedEmailPayload.html.includes(notice), "Email HTML must include AI notice");
  assert.ok(capturedEmailPayload.text.includes(notice), "Email text must include AI notice");

  // Check static/source inclusion in /privacy, ResultViewClient, HomeClient, InterviewClient, PaidResultShareCard
  const requiredFiles = [
    ["src/app/privacy/page.tsx", "analytics:funnel:*"],
    ["src/app/privacy/page.tsx", "Google Analytics 4"],
    ["src/app/result/[orderId]/ResultViewClient.tsx", "AI_DRAFT_REVIEW_NOTICE"],
    ["src/app/HomeClient.tsx", "AI_DRAFT_REVIEW_NOTICE"],
    ["src/app/interview/InterviewClient.tsx", "AI_DRAFT_REVIEW_NOTICE"],
    ["src/components/PaidResultShareCard.tsx", "withAiDraftNoticeText"],
  ];
  for (const [relPath, expectedToken] of requiredFiles) {
    const content = fs.readFileSync(path.resolve(process.cwd(), relPath), "utf8");
    assert.ok(content.includes(expectedToken), `${relPath} must include ${expectedToken}`);
  }
  console.log("PASS 2: AI draft review notice verified across .txt downloads, email, API, and UI views");
  console.log("\nALL PRE-LAUNCH ESSENTIALS CHECKS PASSED.");
} finally {
  server.close();
}
