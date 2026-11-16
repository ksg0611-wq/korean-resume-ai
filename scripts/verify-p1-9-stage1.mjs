/**
 * P1.9 Stage 1 Operational Safeguards Verification Suite
 * Tests:
 * 1. All generation & payment API routes export `maxDuration === 120`
 * 2. Daily KST free path Redis counters (`metrics:free:YYYY-MM-DD:*`) & KRW cost summary on `/api/admin/orders`
 * 3. Free `draft` 300-call circuit breaker:
 *    - 1..300 routes to `gemini-4-hydrogen`
 *    - 301st sends ONE webhook alert to `ALERT_WEBHOOK_URL` and routes 301+ to `gemini-3.8-flash` until KST midnight
 *    - End-to-end `POST /api/generate` (`isFree: true, mode: "draft"`) verifies outbound Gemini model switches from `gemini-4-hydrogen` -> `gemini-3.8-flash`
 * 4. Scenario 6 forced-failure test flag double lock (`TOSS_SECRET_KEY.startsWith("test_")` AND `x-admin-secret` === `ADMIN_SECRET`):
 *    - Strictly disabled when live key, missing secret, wrong secret, or normal request
 *    - Strictly active when double-locked, triggering automated Toss full refund on `/api/generate` & `/api/interview/generate`
 */

import http from "node:http";
import path from "node:path";
import assert from "node:assert/strict";
import fs from "node:fs";
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
  ttl(k) {
    const it = this._prune(k);
    if (!it) return -2;
    if (it.expiresAt === null) return -1;
    return Math.max(0, Math.ceil((it.expiresAt - Date.now()) / 1000));
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
        if (flag === "EX" && args[i + 1] !== undefined) {
          ex = Number(args[++i]);
        } else if (flag === "NX") {
          nx = true;
        }
      }
      if (nx && this.getRaw(key) !== null) {
        return null;
      }
      return this.setRaw(key, val, ex);
    }
    if (cmd === "INCR") {
      const key = String(args[0]);
      const existing = this._prune(key);
      const current = Number(existing?.value ?? 0);
      const next = (Number.isFinite(current) ? current : 0) + 1;
      this.kv.set(key, {
        value: String(next),
        expiresAt: existing?.expiresAt ?? null,
      });
      return next;
    }
    if (cmd === "EXPIRE") {
      const key = String(args[0]);
      const sec = Number(args[1]);
      const existing = this._prune(key);
      if (!existing) return 0;
      existing.expiresAt = Date.now() + sec * 1000;
      return 1;
    }
    if (cmd === "DEL") {
      let n = 0;
      for (const k of args) if (this.kv.delete(String(k))) n++;
      return n;
    }
    if (cmd === "TTL") return this.ttl(String(args[0]));
    if (cmd === "ZADD") {
      const k = String(args[0]);
      if (!this.zsets.has(k)) this.zsets.set(k, new Map());
      this.zsets.get(k).set(String(args[2]), Number(args[1]));
      return 1;
    }
    if (cmd === "ZRANGE") {
      const m = this.zsets.get(String(args[0]));
      if (!m) return [];
      return [...m.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]);
    }
    if (cmd === "EVALSHA") throw new Error("NOSCRIPT");
    if (cmd === "EVAL") {
      const script = String(args[0]);
      const nKeys = Number(args[1]);
      const keys = args.slice(2, 2 + nKeys).map(String);
      const argv = args.slice(2 + nKeys);
      if (script.includes("remainingGenerations") && script.includes("generating")) {
        const [orderKey, lockKey] = keys;
        const order = JSON.parse(this.getRaw(orderKey) || "null");
        if (!order) {
          return JSON.stringify({ ok: false, status: 403, code: "INVALID_ORDER", message: "missing" });
        }
        const lockToken = String(argv[4] || "lock");
        this.setRaw(lockKey, lockToken, Number(argv[3] || 180));
        order.remainingGenerations = Number(order.remainingGenerations) - 1;
        order.reservedGeneration = true;
        order.generatingLockToken = lockToken;
        order.status = "generating";
        this.setRaw(orderKey, JSON.stringify(order), Math.max(60, this.ttl(orderKey)));
        return JSON.stringify({ ok: true, order });
      }
      if (script.includes('local current = tonumber(redis.call("GET", KEYS[1]) or "0")') && script.includes("maxReq")) {
        const key = keys[0];
        const maxReq = Number(argv[0]);
        const ttlSec = Number(argv[1]);
        const current = Number(this.getRaw(key) || "0");
        if (current >= maxReq) {
          return [0, 0, current];
        }
        const updated = current + 1;
        this.setRaw(key, String(updated), updated === 1 ? ttlSec : Math.max(1, this.ttl(key) || ttlSec));
        return [1, Math.max(0, maxReq - updated), updated];
      }
      if (script.includes("DECR") && script.includes("DEL")) {
        const key = keys[0];
        const maxReq = Number(argv[0]);
        const current = Number(this.getRaw(key) || "0");
        if (current <= 0) return [maxReq, 0];
        const updated = current - 1;
        if (updated <= 0) {
          this.kv.delete(key);
          return [maxReq, 0];
        }
        this.setRaw(key, String(updated), Math.max(1, this.ttl(key) || 86400));
        return [Math.max(0, maxReq - updated), updated];
      }
      if (script.includes("SAVE_AND_RELEASE_LOCK") || script.includes('local currentLock = redis.call("GET", KEYS[2])')) {
        const [orderKey, lockKey] = keys;
        this.setRaw(orderKey, String(argv[0]), Math.max(60, this.ttl(orderKey) || 31536000));
        this.kv.delete(lockKey);
        return 1;
      }
      throw new Error("Unsupported EVAL: " + script.slice(0, 120));
    }
    throw new Error("Unsupported cmd: " + cmd);
  }
}

function encodeUpstashResult(val, useBase64) {
  if (!useBase64 || val === null || val === undefined) return val;
  if (typeof val === "string") {
    return val === "OK" ? "OK" : Buffer.from(val, "utf8").toString("base64");
  }
  if (Array.isArray(val)) {
    return val.map((item) => encodeUpstashResult(item, true));
  }
  return val;
}

const store = new MockUpstashStore();
const upstashServer = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    res.setHeader("Content-Type", "application/json");
    const parsed = body ? JSON.parse(body) : [];
    const urlPath = (req.url || "/").split("?")[0];
    const useBase64 = String(req.headers["upstash-encoding"] || "").toLowerCase() === "base64";
    if (urlPath === "/pipeline") {
      res.end(
        JSON.stringify(
          parsed.map((c) => ({ result: encodeUpstashResult(store.exec(c), useBase64) }))
        )
      );
      return;
    }
    res.end(JSON.stringify({ result: encodeUpstashResult(store.exec(parsed), useBase64) }));
  });
});

await new Promise((r) => upstashServer.listen(0, "127.0.0.1", r));
const upstashUrl = `http://127.0.0.1:${upstashServer.address().port}`;
process.env.UPSTASH_REDIS_REST_URL = upstashUrl;
process.env.UPSTASH_REDIS_REST_TOKEN = "mock_token";
process.env.TOSS_SECRET_KEY = "test_sk_MOCK_STAGE1";
process.env.ADMIN_SECRET = "super_secret_admin_stage1";
process.env.GEMINI_API_KEY = "mock_gemini_key";
process.env.ALERT_WEBHOOK_URL = "https://webhook.example.test/ops";

const webhookCalls = [];
const geminiModelCalls = [];
const tossCalls = [];

function buildMock4QJson() {
  const mk = (id, order, title) => ({
    id,
    order,
    title,
    body: `${title} 답변 초안입니다. 지원자는 공공기관 실무 과제에서 기준과 데이터를 점검하고 협업 부서와 일정을 조율하여 처리 속도와 품질을 개선한 경험을 바탕으로 입사 후에도 안정적인 행정 서비스 운영에 기여하겠습니다. 추가 검증 절차와 재발 방지 매뉴얼을 정립하여 협업 신뢰도를 높였습니다. `.repeat(2),
  });
  return JSON.stringify({
    items: [
      mk("q1", 1, "1. 지원동기 및 기관 이해"),
      mk("q2", 2, "2. 직무역량 및 문제해결 경험"),
      mk("q3", 3, "3. 협업·갈등 해결 경험"),
      mk("q4", 4, "4. 입사 후 포부 및 발전 계획"),
    ],
  });
}

function buildMock10QJson() {
  const qs = Array.from({ length: 10 }, (_, idx) => ({
    question: `직무 기반 예상 질문 ${idx + 1}번입니다. 어떤 기준으로 업무 우선순위를 정하셨나요?`,
    intent: "직무 적합성 및 문제해결 논리 검증",
    answerTip: "STAR 구조로 본인의 행동과 결과를 중심으로 답변하세요.",
  }));
  return JSON.stringify({ questions: qs });
}

globalThis.fetch = async (input, init) => {
  const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (urlStr === process.env.ALERT_WEBHOOK_URL) {
    const reqBody = init?.body ? JSON.parse(String(init.body)) : {};
    webhookCalls.push(reqBody);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }
  if (urlStr.startsWith("https://api.tosspayments.com/")) {
    const reqBody = init?.body ? JSON.parse(String(init.body)) : {};
    tossCalls.push({ url: urlStr, body: reqBody });
    if (urlStr.endsWith("/v1/payments/confirm")) {
      return new Response(
        JSON.stringify({
          paymentKey: reqBody.paymentKey,
          orderId: reqBody.orderId,
          status: "DONE",
          totalAmount: Number(reqBody.amount),
          receipt: { url: `https://dashboard.tosspayments.com/receipt/${reqBody.orderId}` },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (urlStr.includes("/cancel")) {
      return new Response(
        JSON.stringify({
          paymentKey: "mock_pk",
          orderId: "mock",
          status: "CANCELED",
          cancels: [{ cancelAmount: 4900, transactionKey: "tx_refund_mock_1" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
  }
  if (urlStr.startsWith("https://generativelanguage.googleapis.com/")) {
    const m = urlStr.match(/models\/([^/:]+):/);
    const modelName = m ? m[1] : "unknown";
    geminiModelCalls.push(modelName);
    const bodyStr = init?.body ? String(init.body) : "";
    const text = bodyStr.includes("10개") || bodyStr.includes("answerTip") ? buildMock10QJson() : buildMock4QJson();
    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text }] } }],
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 200, totalTokenCount: 300 },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
  if (urlStr.startsWith(upstashUrl)) {
    return await httpRequestPassthrough(urlStr, init);
  }
  throw new Error("Unexpected outbound fetch in test: " + urlStr);
};

async function httpRequestPassthrough(urlStr, init) {
  const urlObj = new URL(urlStr);
  return await new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method: init?.method || "GET",
        headers: init?.headers || {},
      },
      (res) => {
        let chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => {
          resolve(
            new Response(Buffer.concat(chunks), {
              status: res.statusCode || 200,
              headers: { "Content-Type": res.headers["content-type"] || "application/json" },
            })
          );
        });
      }
    );
    req.on("error", reject);
    if (init?.body) req.write(init.body);
    req.end();
  });
}

const jiti = createJiti(import.meta.url, {
  alias: { "@": path.resolve(process.cwd(), "src") },
});

try {
  // ── 1. Verify maxDuration === 120 across all generation & payment routes ──
  const routesToCheck = [
    "src/app/api/generate/route.ts",
    "src/app/api/diagnose/route.ts",
    "src/app/api/payments/prepare/route.ts",
    "src/app/api/payments/success/route.ts",
    "src/app/api/interview/payment/route.ts",
    "src/app/api/interview/generate/route.ts",
    "src/app/api/interview/evaluate/route.ts",
    "src/app/api/interview/retry/route.ts",
    "src/app/api/interview/self-intro/route.ts",
  ];
  for (const relPath of routesToCheck) {
    const mod = await jiti.import(path.resolve(process.cwd(), relPath));
    assert.equal(mod.maxDuration, 120, `${relPath} maxDuration must be 120`);
  }
  console.log(`PASS 1: All ${routesToCheck.length} API routes export maxDuration = 120`);

  // ── 2. Verify daily KST metrics + KRW summary + 300-call circuit breaker + /api/admin/orders ──
  const freeMetrics = await jiti.import(path.resolve(process.cwd(), "src/lib/freeMetrics.ts"));
  const adminOrdersRoute = await jiti.import(path.resolve(process.cwd(), "src/app/api/admin/orders/route.ts"));
  const generateRoute = await jiti.import(path.resolve(process.cwd(), "src/app/api/generate/route.ts"));

  const fixedDate = new Date("2026-11-15T05:00:00Z"); // 2026-11-15 14:00 KST (isolated from today)
  const kstDate = freeMetrics.getKstDateString(fixedDate);
  assert.equal(kstDate, "2026-11-15");

  await freeMetrics.recordFreeEndpointCall("diagnose", fixedDate);
  await freeMetrics.recordFreeEndpointCall("diagnose", fixedDate);
  await freeMetrics.recordFreeEndpointCall("interview_gen", fixedDate);
  await freeMetrics.recordFreeEndpointCall("interview_eval", fixedDate);

  // Seed draft counter to 299 for fixedDate
  store.setRaw(freeMetrics.buildFreeMetricKey(kstDate, "draft"), "299", 86400);
  store.setRaw(freeMetrics.buildFreeMetricKey(kstDate, "draft_hydrogen"), "299", 86400);

  const c300 = await freeMetrics.checkAndRecordFreeDraftCall(fixedDate);
  assert.equal(c300.count, 300);
  assert.equal(c300.tripped, false);
  assert.equal(c300.preferredModel, "gemini-4-hydrogen");
  assert.equal(c300.alertSent, false);
  assert.equal(webhookCalls.length, 0);

  const c301 = await freeMetrics.checkAndRecordFreeDraftCall(fixedDate);
  assert.equal(c301.count, 301);
  assert.equal(c301.tripped, true);
  assert.equal(c301.preferredModel, "gemini-3.8-flash");
  assert.equal(c301.alertSent, true);
  assert.equal(webhookCalls.length, 1, "Circuit breaker alert must fire ONCE on 301st call");
  assert.equal(webhookCalls[0].alertType, "FREE_DRAFT_CIRCUIT_BREAKER");
  assert.equal(webhookCalls[0].fallbackModel, "gemini-3.8-flash");

  const c302 = await freeMetrics.checkAndRecordFreeDraftCall(fixedDate);
  assert.equal(c302.count, 302);
  assert.equal(c302.tripped, true);
  assert.equal(c302.preferredModel, "gemini-3.8-flash");
  assert.equal(c302.alertSent, false);
  assert.equal(webhookCalls.length, 1, "Subsequent fallback calls must NOT duplicate alerts");

  const summary = await freeMetrics.getDailyFreeMetricsSummary(kstDate);
  assert.equal(summary.circuitBreakerOpen, true);
  assert.equal(summary.counts.diagnose, 2);
  assert.equal(summary.counts.draft, 302);
  assert.equal(summary.counts.draftHydrogen, 300);
  assert.equal(summary.counts.draftFallback, 2);
  assert.equal(summary.counts.interviewGen, 1);
  assert.equal(summary.counts.interviewEval, 1);
  assert.ok(summary.estimatedCostKrw.total > 19_000, "Total estimated KRW cost must accumulate cleanly");

  // Also test actual today's `/api/generate` free draft switch before and after 300
  const todayKst = freeMetrics.getKstDateString();
  store.setRaw(freeMetrics.buildFreeMetricKey(todayKst, "draft"), "299", 86400);
  store.setRaw(freeMetrics.buildFreeMetricKey(todayKst, "draft_hydrogen"), "299", 86400);

  const mkFreeDraftReq = (ip) =>
    new Request("http://localhost:3000/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": ip,
      },
      body: JSON.stringify({
        isFree: true,
        mode: "draft",
        jobTitle: "공기업 일반행정",
        memo: "대학 시절 학생회 회계 업무를 체계적으로 정리하고 부서 간 일정을 조율하여 행사 예산 누락 없이 프로젝트를 완료한 경험이 있습니다. 정밀한 문서 작성과 일정 관리 역량을 갖추고 있습니다.",
      }),
    });

  const res300 = await generateRoute.POST(mkFreeDraftReq("10.0.0.1"));
  assert.equal(res300.status, 200);
  const body300 = await res300.json();
  assert.equal(body300.usedModel, "gemini-4-hydrogen", "Call #300 must route to gemini-4-hydrogen");

  const res301 = await generateRoute.POST(mkFreeDraftReq("10.0.0.2"));
  assert.equal(res301.status, 200);
  const body301 = await res301.json();
  assert.equal(body301.usedModel, "gemini-3.8-flash", "Call #301 must auto-switch to gemini-3.8-flash");
  assert.equal(webhookCalls.length, 2, "Today's threshold crossing fired one webhook alert");

  // Admin API check returns today's freeMetrics cleanly
  const adminRes = await adminOrdersRoute.GET(
    new Request("http://localhost:3000/api/admin/orders?filter=all", {
      headers: { "x-admin-secret": "super_secret_admin_stage1" },
    })
  );
  assert.equal(adminRes.status, 200);
  const adminJson = await adminRes.json();
  assert.equal(adminJson.freeMetrics.date, todayKst);
  assert.equal(adminJson.freeMetrics.circuitBreakerOpen, true);
  assert.equal(adminJson.freeMetrics.counts.draft, 301);
  console.log("PASS 2: Daily metrics, KRW estimate, /api/admin/orders, and 300-call circuit breaker passed");

  // ── 3. Verify Scenario 6 double-lock security (`testFlags.ts`) + end-to-end auto-refund ──
  const testFlags = await jiti.import(path.resolve(process.cwd(), "src/lib/testFlags.ts"));
  const confirmPaymentRoute = await jiti.import(path.resolve(process.cwd(), "src/app/api/payments/success/route.ts"));
  const confirmInterviewRoute = await jiti.import(path.resolve(process.cwd(), "src/app/api/interview/payment/route.ts"));
  const interviewGenRoute = await jiti.import(path.resolve(process.cwd(), "src/app/api/interview/generate/route.ts"));

  // Lock permutation tests
  const mkFlagReq = (adminHeader, forceFailHeader) =>
    new Request("http://localhost:3000/api/generate", {
      method: "POST",
      headers: {
        ...(adminHeader ? { "x-admin-secret": adminHeader } : {}),
        ...(forceFailHeader ? { "x-force-fail": forceFailHeader } : {}),
      },
    });

  process.env.TOSS_SECRET_KEY = "live_sk_REAL_PRODUCTION_KEY";
  assert.equal(
    testFlags.isForceFailAuthorized(mkFlagReq("super_secret_admin_stage1"), true),
    false,
    "MUST stay false when TOSS_SECRET_KEY is live_*"
  );

  process.env.TOSS_SECRET_KEY = "test_sk_MOCK_STAGE1";
  assert.equal(
    testFlags.isForceFailAuthorized(mkFlagReq(null), true),
    false,
    "MUST stay false without x-admin-secret"
  );
  assert.equal(
    testFlags.isForceFailAuthorized(mkFlagReq("wrong_secret"), true),
    false,
    "MUST stay false when x-admin-secret mismatches"
  );
  assert.equal(
    testFlags.isForceFailAuthorized(mkFlagReq("super_secret_admin_stage1"), false),
    false,
    "MUST stay false when forceFail flag is absent"
  );
  assert.equal(
    testFlags.isForceFailAuthorized(mkFlagReq("super_secret_admin_stage1"), true),
    true,
    "MUST authorize ONLY when test_ key + valid x-admin-secret + body.forceFail"
  );
  assert.equal(
    testFlags.isForceFailAuthorized(mkFlagReq("super_secret_admin_stage1", "1")),
    true,
    "MUST authorize when test_ key + valid x-admin-secret + x-force-fail=1"
  );

  // End-to-end test 1: Paid order WITH body.forceFail=true WITHOUT x-admin-secret ignores flag & succeeds normally
  const orderOkId = "order_stage1_safe_" + Date.now();
  const payOkRes = await confirmPaymentRoute.POST(
    new Request("http://localhost:3000/api/payments/success", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-secret": "super_secret_admin_stage1",
      },
      body: JSON.stringify({
        orderId: orderOkId,
        paymentKey: "pk_safe_1",
        amount: 4900,
        planType: "resume_single",
      }),
    })
  );
  assert.equal(payOkRes.status, 200);

  const geminiCountBefore = geminiModelCalls.length;
  const tossCallsBeforeSafe = tossCalls.length;
  const safeGenRes = await generateRoute.POST(
    new Request("http://localhost:3000/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" }, // NO x-admin-secret!
      body: JSON.stringify({
        orderId: orderOkId,
        isFree: false,
        jobTitle: "공기업 사무직",
        memo: "학과 행사 예산 관리 및 지출 정산 시스템을 개선해 행정 누락을 없애고 부서 협업을 이끌었던 경험이 있습니다. 꼼꼼함과 소통 역량이 강점입니다.",
        forceFail: true,
      }),
    })
  );
  assert.equal(safeGenRes.status, 200, "Unauthorized forceFail flag MUST be ignored on normal requests");
  assert.ok(geminiModelCalls.length > geminiCountBefore);
  assert.equal(tossCalls.length, tossCallsBeforeSafe, "Cancel MUST NOT be called when flag is unauthorized");

  // End-to-end test 2: Paid resume order WITH double-lock triggers forced failure -> automated Toss cancel -> refunded
  const orderForceId = "order_stage1_ff_resume_" + Date.now();
  const payForceRes = await confirmPaymentRoute.POST(
    new Request("http://localhost:3000/api/payments/success", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-secret": "super_secret_admin_stage1",
      },
      body: JSON.stringify({
        orderId: orderForceId,
        paymentKey: "pk_force_resume_1",
        amount: 4900,
        planType: "resume_single",
      }),
    })
  );
  assert.equal(payForceRes.status, 200);

  const geminiBeforeForce = geminiModelCalls.length;
  const forceGenRes = await generateRoute.POST(
    new Request("http://localhost:3000/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-secret": "super_secret_admin_stage1",
      },
      body: JSON.stringify({
        orderId: orderForceId,
        isFree: false,
        jobTitle: "공기업 사무직",
        memo: "테스트 강제 실패 시나리오 6번 자동 환불 검증용 자소서 원문 입력 데이터입니다. 충분히 긴 텍스트입니다.",
        forceFail: true,
      }),
    })
  );
  assert.equal(forceGenRes.status, 500);
  const forceGenJson = await forceGenRes.json();
  assert.equal(forceGenJson.code, "AUTO_REFUNDED");
  assert.equal(forceGenJson.refunded, true);
  assert.equal(forceGenJson.order.status, "refunded");
  assert.equal(geminiModelCalls.length, geminiBeforeForce, "Forced failure should trigger BEFORE burning Gemini credits");
  assert.ok(
    tossCalls.some((c) => c.url.includes("pk_force_resume_1/cancel")),
    "Toss /cancel API MUST be invoked"
  );

  // End-to-end test 3: Paid interview order WITH double-lock triggers automated refund
  const orderIvId = "order_stage1_ff_iv_" + Date.now();
  const payIvRes = await confirmInterviewRoute.POST(
    new Request("http://localhost:3000/api/interview/payment", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-secret": "super_secret_admin_stage1",
      },
      body: JSON.stringify({
        orderId: orderIvId,
        paymentKey: "pk_force_iv_1",
        amount: 4900,
        planType: "interview_single",
      }),
    })
  );
  assert.equal(payIvRes.status, 200);

  const forceIvRes = await interviewGenRoute.POST(
    new Request("http://localhost:3000/api/interview/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-secret": "super_secret_admin_stage1",
      },
      body: JSON.stringify({
        orderId: orderIvId,
        isFree: false,
        jobCategory: "공공기관 경영·회계·사무",
        resumeText: "공공기관 지원 자기소개서 초안입니다. 고객 응대 프로세스와 문서 표준화를 주도해 업무 처리 효율을 높인 경험이 있으며 면접 대비 테스트 진행 중입니다.",
        forceFail: true,
      }),
    })
  );
  assert.equal(forceIvRes.status, 500);
  const forceIvJson = await forceIvRes.json();
  assert.equal(forceIvJson.code, "AUTO_REFUNDED");
  assert.equal(forceIvJson.refunded, true);
  assert.ok(
    tossCalls.some((c) => c.url.includes("pk_force_iv_1/cancel")),
    "Interview Toss /cancel API MUST be invoked on forced fail"
  );
  console.log("PASS 3: Scenario 6 double lock security & auto-refund verified cleanly");

  // ── 4. Verify Home UI 3-step copy present in source ──
  const homeClientSrc = fs.readFileSync(path.resolve(process.cwd(), "src/app/HomeClient.tsx"), "utf8");
  const paySectionSrc = fs.readFileSync(path.resolve(process.cwd(), "src/components/PaymentSection.tsx"), "utf8");
  for (const label of ["1단계: 문항 분석", "2단계: STAR 초안 작성", "3단계: 블라인드·수치 규칙 검수"]) {
    assert.ok(homeClientSrc.includes(label), `HomeClient.tsx must include '${label}'`);
  }
  assert.ok(paySectionSrc.includes("elapsedSeconds"), "PaymentSection.tsx must track elapsedSeconds");
  assert.ok(paySectionSrc.includes("progressSteps"), "PaymentSection.tsx must render progressSteps");
  console.log("PASS 4: Home 3-step elapsed UI verified cleanly");

  console.log("\nALL P1.9 STAGE 1 CHECKS PASSED.");
} finally {
  upstashServer.closeAllConnections?.();
  upstashServer.close();
  http.globalAgent.destroy();
}
process.exit(0);
