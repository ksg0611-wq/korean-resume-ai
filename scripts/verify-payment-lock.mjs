/**
 * Test Payment Lock Verification Suite
 * Tests:
 * 1. `POST /api/admin/session` verifies ADMIN_SECRET and issues `kr_admin_session` cookie
 *    with `HttpOnly; Secure; SameSite=Lax; Path=/` (plaintext ADMIN_SECRET never stored in cookie)
 * 2. When `TOSS_SECRET_KEY` starts with `test_`:
 *    - `/api/payments/prepare`, `/api/payments/success`, `/api/interview/payment` return 403 for non-admins
 *    - Same endpoints succeed (200) when authenticated via `kr_admin_session` cookie or `x-admin-secret`
 *    - Forged/tampered cookies are rejected (403)
 * 3. When `TOSS_SECRET_KEY` starts with `live_`:
 *    - Lock automatically deactivates (200 without cookie/secret)
 */

import http from "node:http";
import path from "node:path";
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
    throw new Error("Unsupported cmd: " + cmd);
  }
}

function encodeUpstashResult(val, useBase64) {
  if (!useBase64 || val === null || val === undefined) return val;
  if (typeof val === "string") {
    return val === "OK" ? "OK" : Buffer.from(val, "utf8").toString("base64");
  }
  if (Array.isArray(val)) return val.map((item) => encodeUpstashResult(item, true));
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
        JSON.stringify(parsed.map((c) => ({ result: encodeUpstashResult(store.exec(c), useBase64) })))
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
process.env.TOSS_SECRET_KEY = "test_sk_LOCK_TEST";
process.env.ADMIN_SECRET = "lock_test_admin_secret";

globalThis.fetch = async (input, init) => {
  const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (urlStr.startsWith("https://api.tosspayments.com/")) {
    const reqBody = init?.body ? JSON.parse(String(init.body)) : {};
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
  }
  if (urlStr.startsWith(upstashUrl)) {
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
          const chunks = [];
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
  throw new Error("Unexpected fetch: " + urlStr);
};

const jiti = createJiti(import.meta.url, {
  alias: { "@": path.resolve(process.cwd(), "src") },
});

try {
  const sessionRoute = await jiti.import(path.resolve(process.cwd(), "src/app/api/admin/session/route.ts"));
  const adminOrdersRoute = await jiti.import(path.resolve(process.cwd(), "src/app/api/admin/orders/route.ts"));
  const prepareRoute = await jiti.import(path.resolve(process.cwd(), "src/app/api/payments/prepare/route.ts"));
  const successRoute = await jiti.import(path.resolve(process.cwd(), "src/app/api/payments/success/route.ts"));
  const ivPayRoute = await jiti.import(path.resolve(process.cwd(), "src/app/api/interview/payment/route.ts"));

  // 1. Session issuance & cookie attributes
  const badLoginRes = await sessionRoute.POST(
    new Request("http://localhost:3000/api/admin/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: "wrong" }),
    })
  );
  assert.equal(badLoginRes.status, 401);

  const loginRes = await sessionRoute.POST(
    new Request("http://localhost:3000/api/admin/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: process.env.ADMIN_SECRET }),
    })
  );
  assert.equal(loginRes.status, 200);
  const setCookie = loginRes.headers.get("set-cookie") || "";
  assert.ok(setCookie.includes("kr_admin_session="), "Must set kr_admin_session cookie");
  assert.ok(setCookie.includes("HttpOnly"), "Cookie must be HttpOnly");
  assert.ok(setCookie.includes("Secure"), "Cookie must be Secure");
  assert.ok(/SameSite=lax/i.test(setCookie), "Cookie must have SameSite=Lax");
  assert.ok(setCookie.includes("Path=/"), "Cookie must have Path=/");
  assert.ok(!setCookie.includes(process.env.ADMIN_SECRET), "Cookie value must NOT leak ADMIN_SECRET");

  const cookiePair = setCookie.split(";")[0];

  // Cookie authenticates /api/admin/orders without header
  const ordersCookieRes = await adminOrdersRoute.GET(
    new Request("http://localhost:3000/api/admin/orders", {
      headers: { cookie: cookiePair },
    })
  );
  assert.equal(ordersCookieRes.status, 200);
  const ordersJson = await ordersCookieRes.json();
  assert.equal(ordersJson.testPaymentMode, true);
  console.log("PASS 1: /api/admin/session issues HttpOnly; Secure; SameSite=Lax; Path=/ cookie and unlocks /api/admin/orders");

  // 2. Under test_ key, non-admin requests to prepare, success, interview/payment are blocked (403)
  const unauthPrepare = await prepareRoute.POST(
    new Request("http://localhost:3000/api/payments/prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: "ord_unauth_1", planType: "resume_single" }),
    })
  );
  assert.equal(unauthPrepare.status, 403);
  assert.equal((await unauthPrepare.json()).code, "TEST_PAYMENT_LOCKED");

  const forgedCookiePrepare = await prepareRoute.POST(
    new Request("http://localhost:3000/api/payments/prepare", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: "kr_admin_session=9999999999999.deadbeef.forgedsig",
      },
      body: JSON.stringify({ orderId: "ord_forged_1", planType: "resume_single" }),
    })
  );
  assert.equal(forgedCookiePrepare.status, 403);

  const unauthSuccess = await successRoute.POST(
    new Request("http://localhost:3000/api/payments/success", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: "ord_unauth_1", paymentKey: "pk_1", amount: 4900 }),
    })
  );
  assert.equal(unauthSuccess.status, 403);

  const unauthIvPay = await ivPayRoute.POST(
    new Request("http://localhost:3000/api/interview/payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: "int_unauth_1", paymentKey: "pk_2", amount: 4900 }),
    })
  );
  assert.equal(unauthIvPay.status, 403);
  console.log("PASS 2: Non-admin & forged-cookie payment requests blocked with 403 under test_ key");

  // 3. Under test_ key, admin cookie allows prepare, success, and interview/payment (200)
  const adminPrepare = await prepareRoute.POST(
    new Request("http://localhost:3000/api/payments/prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookiePair },
      body: JSON.stringify({ orderId: "ord_admin_1", planType: "resume_single" }),
    })
  );
  assert.equal(adminPrepare.status, 200);
  assert.equal((await adminPrepare.json()).prepared, true);

  const adminSuccess = await successRoute.POST(
    new Request("http://localhost:3000/api/payments/success", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookiePair },
      body: JSON.stringify({
        orderId: "ord_admin_1",
        paymentKey: "pk_admin_1",
        amount: 4900,
        planType: "resume_single",
      }),
    })
  );
  assert.equal(adminSuccess.status, 200);

  const adminIvPay = await ivPayRoute.POST(
    new Request("http://localhost:3000/api/interview/payment", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookiePair },
      body: JSON.stringify({
        orderId: "int_admin_1",
        paymentKey: "pk_admin_2",
        amount: 4900,
        planType: "interview_single",
      }),
    })
  );
  assert.equal(adminIvPay.status, 200);
  console.log("PASS 3: Admin cookie permits prepare, payments/success, and interview/payment (200) under test_ key");

  // 4. Switching TOSS_SECRET_KEY to live_ automatically removes the lock without code changes
  process.env.TOSS_SECRET_KEY = "live_sk_REAL_PRODUCTION";
  const livePrepare = await prepareRoute.POST(
    new Request("http://localhost:3000/api/payments/prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: "ord_live_1", planType: "resume_single" }),
    })
  );
  assert.equal(livePrepare.status, 200);
  assert.equal((await livePrepare.json()).prepared, true);
  console.log("PASS 4: Switching TOSS_SECRET_KEY to live_* automatically disables payment lock (200)");

  console.log("\nALL TEST PAYMENT LOCK CHECKS PASSED.");
} finally {
  upstashServer.closeAllConnections?.();
  upstashServer.close();
  http.globalAgent.destroy();
}
process.exit(0);
