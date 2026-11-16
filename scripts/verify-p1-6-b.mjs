/**
 * P1.6 Phase B Verification Suite
 * - Tests 7,900원 Bundle (companion ticket, result linking, bundle auto-refund cascade, interview_pending on companion fail)
 * - Tests +3,000원 Interview Upgrade (5 security attack guards, 7-day result expiry discount preservation, 1-per-order limit, refund unlock)
 * - Runs completely in-process against real Next.js handlers using mock Upstash REST/Lua + Toss interceptor
 */

import http from "node:http";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const jitiModule = require(path.resolve(process.cwd(), "node_modules/jiti"));
const createJiti =
  jitiModule.createJiti || (typeof jitiModule === "function" ? jitiModule : jitiModule.default);

// Minimal in-memory Upstash store supporting orders/payments/context flows
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
      let ex = null;
      for (let i = 2; i < args.length; i++) {
        if (String(args[i]).toUpperCase() === "EX" && args[i + 1] !== undefined) {
          ex = Number(args[++i]);
        }
      }
      return this.setRaw(String(args[0]), args[1], ex);
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
        if (!order) return JSON.stringify({ ok: false, status: 403, code: "INVALID_ORDER", message: "missing" });
        const lockToken = String(argv[4] || "lock");
        this.setRaw(lockKey, lockToken, Number(argv[3] || 180));
        order.remainingGenerations = Number(order.remainingGenerations) - 1;
        order.reservedGeneration = true;
        order.generatingLockToken = lockToken;
        order.status = "generating";
        this.setRaw(orderKey, JSON.stringify(order), Math.max(60, this.ttl(orderKey)));
        return JSON.stringify({ ok: true, order });
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

const store = new MockUpstashStore();
const upstashServer = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    res.setHeader("Content-Type", "application/json");
    const parsed = body ? JSON.parse(body) : [];
    const urlPath = (req.url || "/").split("?")[0];
    if (urlPath === "/pipeline") {
      res.end(JSON.stringify(parsed.map((c) => ({ result: store.exec(c) }))));
      return;
    }
    res.end(JSON.stringify({ result: store.exec(parsed) }));
  });
});

await new Promise((r) => upstashServer.listen(0, "127.0.0.1", r));
const upstashUrl = `http://127.0.0.1:${upstashServer.address().port}`;
process.env.UPSTASH_REDIS_REST_URL = upstashUrl;
process.env.UPSTASH_REDIS_REST_TOKEN = "mock_token";
process.env.TOSS_SECRET_KEY = "test_sk_MOCK";

const tossCalls = [];
let forcedConfirmAmount = null;
const origFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input, init) => {
  const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (urlStr.startsWith("https://api.tosspayments.com/")) {
    const reqBody = init?.body ? JSON.parse(String(init.body)) : {};
    tossCalls.push({ url: urlStr, body: reqBody });
    if (urlStr.endsWith("/v1/payments/confirm")) {
      return new Response(
        JSON.stringify({
          paymentKey: reqBody.paymentKey,
          orderId: reqBody.orderId,
          status: "DONE",
          totalAmount: forcedConfirmAmount ?? Number(reqBody.amount),
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
          cancels: [{ cancelAmount: 4900 }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
  }
  return origFetch(input, init);
};

const jiti = createJiti(import.meta.url, {
  alias: { "@": path.join(process.cwd(), "src") },
  interopDefault: true,
});

const prepareRoute = await jiti.import(path.join(process.cwd(), "src/app/api/payments/prepare/route.ts"));
const successRoute = await jiti.import(path.join(process.cwd(), "src/app/api/payments/success/route.ts"));
const ivPaymentRoute = await jiti.import(path.join(process.cwd(), "src/app/api/interview/payment/route.ts"));
const ivContextRoute = await jiti.import(path.join(process.cwd(), "src/app/api/interview/context/route.ts"));
const ordersMod = await jiti.import(path.join(process.cwd(), "src/lib/orders.ts"));
const resultsMod = await jiti.import(path.join(process.cwd(), "src/lib/results.ts"));

function makeJsonReq(url, method, body) {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

try {
  // ── 1. Bundle 7,900원 Flow ──
  const prepBundle = await prepareRoute.POST(
    makeJsonReq("http://localhost/api/payments/prepare", "POST", {
      orderId: "ord_bundle_1",
      planType: "bundle",
      email: "user@example.com",
    })
  );
  assert.equal(prepBundle.status, 200);
  const prepBundleJson = await prepBundle.json();
  assert.equal(prepBundleJson.expectedAmount, 7900);

  // Tampered amount (4900 instead of 7900 intent) -> 403 before Toss confirm
  const badAmtRes = await successRoute.POST(
    makeJsonReq("http://localhost/api/payments/success", "POST", {
      paymentKey: "pk_bad",
      orderId: "ord_bundle_1",
      amount: 4900,
      email: "user@example.com",
    })
  );
  assert.equal(badAmtRes.status, 403);
  assert.equal(tossCalls.length, 0, "Tampered intent should be rejected BEFORE Toss confirm");

  // Valid bundle confirm (7900)
  const okBundleRes = await successRoute.POST(
    makeJsonReq("http://localhost/api/payments/success", "POST", {
      paymentKey: "pk_bundle_1",
      orderId: "ord_bundle_1",
      amount: 7900,
      email: "user@example.com",
    })
  );
  assert.equal(okBundleRes.status, 200);
  const okBundleJson = await okBundleRes.json();
  assert.equal(okBundleJson.order.planType, "bundle");
  assert.equal(okBundleJson.order.linkedInterviewOrderId, "int_ord_bundle_1");

  const compOrder = await resultsMod.findOrderById("int_ord_bundle_1");
  assert.ok(compOrder, "Companion interview order int_ord_bundle_1 must exist");
  assert.equal(compOrder.order.planType, "bundle_companion");
  assert.equal(compOrder.order.remainingGenerations, 1);

  // Complete resume generation on bundle order -> verify context returns resumeText
  const beginRes = await ordersMod.beginPaidGeneration({ orderId: "ord_bundle_1", serviceType: "resume" });
  assert.ok(beginRes.ok);
  const completedBundle = await ordersMod.completePaidGeneration({
    orderKey: beginRes.orderKey,
    order: beginRes.order,
    title: "통합 패키지 결과",
    text: "본문",
    usedModel: "gemini-4-hydrogen",
    jobTitle: "공공기관 디지털·IT",
    items: [
      { id: "q1", order: 1, title: "1. 지원동기", body: "공단 디지털 혁신에 기여하고자 지원했습니다. 파이썬 데이터 분석을 수행했습니다.", charCount: 45, byteCount: 90 },
    ],
  });

  const ctxBundleRes = await ivContextRoute.GET(
    new Request(`http://localhost/api/interview/context?bundleFrom=ord_bundle_1&token=${encodeURIComponent(completedBundle.resultToken)}`)
  );
  assert.equal(ctxBundleRes.status, 200);
  const ctxBundleJson = await ctxBundleRes.json();
  assert.equal(ctxBundleJson.eligible, true);
  assert.equal(ctxBundleJson.linkedInterviewOrderId, "int_ord_bundle_1");
  assert.equal(ctxBundleJson.jobCategory, "공기업 기술·전산·데이터(NCS)");
  assert.ok(ctxBundleJson.resumeText.includes("공단 디지털 혁신"));

  // Bundle companion initial interview generation failure -> MUST mark interview_pending, NO Toss refund
  const tossCountBefore = tossCalls.length;
  const compBegin = await ordersMod.beginPaidGeneration({ orderId: "int_ord_bundle_1", serviceType: "interview" });
  assert.ok(compBegin.ok);
  const compFail = await ordersMod.handlePaidGenerationFailure({
    orderKey: compBegin.orderKey,
    order: compBegin.order,
    error: new Error("Temporary timeout"),
    route: "/api/interview/generate",
  });
  assert.equal(compFail.outcome, "retry_allowed");
  assert.equal(compFail.order.status, "interview_pending");
  assert.equal(compFail.order.remainingGenerations, 1);
  assert.equal(tossCalls.length, tossCountBefore, "Companion interview failure must NOT trigger Toss refund!");
  const adminMismatch = await ordersMod.listAdminOrders({ filter: "mismatch" });
  assert.ok(
    adminMismatch.orders.some((o) => o.orderId === "int_ord_bundle_1" && o.status === "interview_pending"),
    "interview_pending order must appear in /admin mismatch list"
  );

  // Unused Bundle auto-refund cascade (ord_bundle_2 fails before resume generation)
  await prepareRoute.POST(
    makeJsonReq("http://localhost/api/payments/prepare", "POST", {
      orderId: "ord_bundle_2",
      planType: "bundle",
      email: "user2@example.com",
    })
  );
  await successRoute.POST(
    makeJsonReq("http://localhost/api/payments/success", "POST", {
      paymentKey: "pk_bundle_2",
      orderId: "ord_bundle_2",
      amount: 7900,
      email: "user2@example.com",
    })
  );
  const b2Begin = await ordersMod.beginPaidGeneration({ orderId: "ord_bundle_2", serviceType: "resume" });
  const b2Fail = await ordersMod.handlePaidGenerationFailure({
    orderKey: b2Begin.orderKey,
    order: b2Begin.order,
    error: new Error("Resume failed on 1st gen"),
    route: "/api/generate",
  });
  assert.equal(b2Fail.outcome, "refunded");
  const comp2After = await resultsMod.findOrderById("int_ord_bundle_2");
  assert.equal(comp2After.order.status, "refunded");
  assert.equal(comp2After.order.paid, false);
  assert.equal(comp2After.order.remainingGenerations, 0);
  console.log("[PASS] 1. Bundle 7,900원 flow, companion ticket, interview_pending & refund cascade passed.");

  // ── 2. +3,000원 Upgrade & Security Tests ──
  // Create standalone resume order ord_single_1
  await prepareRoute.POST(
    makeJsonReq("http://localhost/api/payments/prepare", "POST", {
      orderId: "ord_single_1",
      planType: "resume_single",
      email: "buyer@example.com",
    })
  );
  await successRoute.POST(
    makeJsonReq("http://localhost/api/payments/success", "POST", {
      paymentKey: "pk_single_1",
      orderId: "ord_single_1",
      amount: 4900,
      email: "buyer@example.com",
    })
  );
  const sBegin = await ordersMod.beginPaidGeneration({ orderId: "ord_single_1", serviceType: "resume" });
  const sComp = await ordersMod.completePaidGeneration({
    orderKey: sBegin.orderKey,
    order: sBegin.order,
    title: "자소서 단독",
    text: "단독 자소서 원문 내용입니다.",
    usedModel: "gemini-4-hydrogen",
    jobTitle: "공공기관 일반행정",
    items: [{ id: "q1", order: 1, title: "1. 지원동기", body: "행정 인턴 경험으로 업무 효율을 높였습니다.", charCount: 25, byteCount: 50 }],
  });

  // Attack 1: arbitrary 3,000원 payment without baseOrderId -> 403
  const hackNoBase = await ivPaymentRoute.POST(
    makeJsonReq("http://localhost/api/interview/payment", "POST", {
      paymentKey: "pk_hack1",
      orderId: "int_hack1",
      amount: 3000,
      email: "attacker@example.com",
    })
  );
  assert.equal(hackNoBase.status, 403);

  // Attack 2: wrong baseResultToken -> 403
  const hackBadTok = await prepareRoute.POST(
    makeJsonReq("http://localhost/api/payments/prepare", "POST", {
      orderId: "int_hack2",
      planType: "interview_upgrade",
      baseOrderId: "ord_single_1",
      baseResultToken: "WRONG_TOKEN",
      email: "attacker@example.com",
    })
  );
  assert.equal(hackBadTok.status, 403);

  // Attack 3: bundle order cannot use +3,000원 upgrade -> 403
  const hackBundleUpg = await prepareRoute.POST(
    makeJsonReq("http://localhost/api/payments/prepare", "POST", {
      orderId: "int_hack3",
      planType: "interview_upgrade",
      baseOrderId: "ord_bundle_1",
      baseResultToken: completedBundle.resultToken,
      email: "user@example.com",
    })
  );
  assert.equal(hackBundleUpg.status, 403);

  // Attack 4: Toss returns unexpected totalAmount (3000) when intent was interview_single (4900) -> auto cancel + 403
  await prepareRoute.POST(
    makeJsonReq("http://localhost/api/payments/prepare", "POST", {
      orderId: "int_hack4",
      planType: "interview_single",
      email: "hacker@example.com",
    })
  );
  forcedConfirmAmount = 3000;
  const cancelsBefore = tossCalls.filter((c) => c.url.includes("/cancel")).length;
  const tamperedRes = await ivPaymentRoute.POST(
    makeJsonReq("http://localhost/api/interview/payment", "POST", {
      paymentKey: "pk_hack4",
      orderId: "int_hack4",
      amount: 4900,
      email: "hacker@example.com",
    })
  );
  forcedConfirmAmount = null;
  assert.equal(tamperedRes.status, 403);
  const cancelsAfter = tossCalls.filter((c) => c.url.includes("/cancel")).length;
  assert.equal(cancelsAfter, cancelsBefore + 1, "Mismatched Toss totalAmount MUST trigger immediate cancelTossPayment");

  // Context retrieval: alive (< 7d) + after 7d expiry (DEL result:ord_single_1)
  const ctxAlive = await ivContextRoute.GET(
    new Request(`http://localhost/api/interview/context?upgradeFrom=ord_single_1&token=${encodeURIComponent(sComp.resultToken)}`)
  );
  assert.equal(ctxAlive.status, 200);
  const ctxAliveJson = await ctxAlive.json();
  assert.equal(ctxAliveJson.eligible, true);
  assert.equal(ctxAliveJson.discountPrice, 3000);
  assert.equal(ctxAliveJson.resumeExpired, false);
  assert.ok(ctxAliveJson.resumeText.includes("행정 인턴 경험"));

  // Simulate 7-day result expiration
  store.exec(["DEL", "result:ord_single_1"]);
  const ctxExpired = await ivContextRoute.GET(
    new Request(`http://localhost/api/interview/context?upgradeFrom=ord_single_1&token=${encodeURIComponent(sComp.resultToken)}`)
  );
  assert.equal(ctxExpired.status, 200);
  const ctxExpJson = await ctxExpired.json();
  assert.equal(ctxExpJson.eligible, true, "Discount eligibility must survive 7-day result expiration (1-yr order TTL)");
  assert.equal(ctxExpJson.resumeExpired, true);
  assert.equal(ctxExpJson.resumeText, null);

  // Valid +3,000원 upgrade payment
  const prepUpg = await prepareRoute.POST(
    makeJsonReq("http://localhost/api/payments/prepare", "POST", {
      orderId: "int_upg_1",
      planType: "interview_upgrade",
      baseOrderId: "ord_single_1",
      baseResultToken: sComp.resultToken,
      email: "buyer@example.com",
    })
  );
  assert.equal(prepUpg.status, 200);
  const okUpg = await ivPaymentRoute.POST(
    makeJsonReq("http://localhost/api/interview/payment", "POST", {
      paymentKey: "pk_upg_1",
      orderId: "int_upg_1",
      amount: 3000,
      email: "buyer@example.com",
      planType: "interview_upgrade",
      baseOrderId: "ord_single_1",
      baseResultToken: sComp.resultToken,
    })
  );
  assert.equal(okUpg.status, 200);
  const okUpgJson = await okUpg.json();
  assert.equal(okUpgJson.order.planType, "interview_upgrade");
  assert.equal(okUpgJson.order.baseOrderId, "ord_single_1");

  // Attack 5: Duplicate +3,000원 upgrade attempt on same base order -> 403 ALREADY_UPGRADED
  const dupUpg = await prepareRoute.POST(
    makeJsonReq("http://localhost/api/payments/prepare", "POST", {
      orderId: "int_upg_2",
      planType: "interview_upgrade",
      baseOrderId: "ord_single_1",
      baseResultToken: sComp.resultToken,
      email: "buyer@example.com",
    })
  );
  assert.equal(dupUpg.status, 403);
  const dupErr = await dupUpg.json();
  assert.equal(dupErr.code, "ALREADY_UPGRADED");

  // If upgrade fails 1st gen and auto-refunds, baseOrder.upgradedToInterviewOrderId must unlock
  const upgBegin = await ordersMod.beginPaidGeneration({ orderId: "int_upg_1", serviceType: "interview" });
  const upgFail = await ordersMod.handlePaidGenerationFailure({
    orderKey: upgBegin.orderKey,
    order: upgBegin.order,
    error: new Error("Interview init error"),
    route: "/api/interview/generate",
  });
  assert.equal(upgFail.outcome, "refunded");
  const baseAfterRefund = await resultsMod.findOrderById("ord_single_1");
  assert.equal(baseAfterRefund.order.upgradedToInterviewOrderId, null, "Auto-refunded upgrade must unlock base order eligibility");

  console.log("[PASS] 2. +3,000원 Upgrade security guards, 7d expiry fallback, 1-per-order limit & refund unlock passed.");
} finally {
  upstashServer.closeAllConnections?.();
  upstashServer.close();
}
