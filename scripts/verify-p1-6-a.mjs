/**
 * P1.6 Phase A 종합 검증 스크립트 (Live Gemini + In-Process Upstash/Toss/Resend Mock)
 *
 * 실행:
 *   node scripts/verify-p1-6-a.mjs
 */

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const jitiModule = require(path.resolve(process.cwd(), "node_modules/jiti"));
const createJiti =
  jitiModule.createJiti || (typeof jitiModule === "function" ? jitiModule : jitiModule.default);

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadEnvLocal();

if (!process.env.GEMINI_API_KEY) {
  console.error("ERROR: GEMINI_API_KEY is missing in .env.local or environment.");
  process.exit(1);
}

// ── 1. In-Process Upstash Redis REST Mock (with Lua emulation) ──
class MockUpstashStore {
  constructor() {
    /** @type {Map<string, { value: any, expiresAt: number | null }>} */
    this.kv = new Map();
    /** @type {Map<string, { zset: Map<string, number>, expiresAt: number | null }>} */
    this.zsets = new Map();
  }

  _now() {
    return Date.now();
  }

  _prune(key) {
    const item = this.kv.get(key);
    if (item && item.expiresAt !== null && item.expiresAt <= this._now()) {
      this.kv.delete(key);
      return null;
    }
    return item || null;
  }

  getRaw(key) {
    const item = this._prune(key);
    return item ? item.value : null;
  }

  setRaw(key, value, exSeconds = null) {
    const expiresAt =
      exSeconds && Number(exSeconds) > 0
        ? this._now() + Number(exSeconds) * 1000
        : null;
    this.kv.set(key, { value, expiresAt });
    return "OK";
  }

  ttl(key) {
    const item = this._prune(key);
    if (!item) return -2;
    if (item.expiresAt === null) return -1;
    return Math.max(0, Math.ceil((item.expiresAt - this._now()) / 1000));
  }

  del(...keys) {
    let count = 0;
    for (const k of keys) {
      if (this.kv.delete(k)) count += 1;
      if (this.zsets.delete(k)) count += 1;
    }
    return count;
  }

  _tryParse(v) {
    if (typeof v !== "string") return v;
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }

  _stringify(v) {
    return typeof v === "string" ? v : JSON.stringify(v);
  }

  execCommand(cmdArray) {
    if (!Array.isArray(cmdArray) || cmdArray.length === 0) return null;
    const cmd = String(cmdArray[0]).toUpperCase();
    const args = cmdArray.slice(1);

    if (cmd === "GET") {
      return this.getRaw(String(args[0]));
    }

    if (cmd === "MGET") {
      return args.map((k) => this.getRaw(String(k)));
    }

    if (cmd === "SET") {
      const key = String(args[0]);
      const val = args[1];
      let ex = null;
      let nx = false;
      for (let i = 2; i < args.length; i++) {
        const flag = String(args[i]).toUpperCase();
        if (flag === "EX" && args[i + 1] !== undefined) {
          ex = Number(args[i + 1]);
          i += 1;
        } else if (flag === "PX" && args[i + 1] !== undefined) {
          ex = Number(args[i + 1]) / 1000;
          i += 1;
        } else if (flag === "NX") {
          nx = true;
        }
      }
      if (nx && this.getRaw(key) !== null) {
        return null;
      }
      return this.setRaw(key, val, ex);
    }

    if (cmd === "SETEX") {
      return this.setRaw(String(args[0]), args[2], Number(args[1]));
    }

    if (cmd === "DEL") {
      return this.del(...args.map(String));
    }

    if (cmd === "TTL") {
      return this.ttl(String(args[0]));
    }

    if (cmd === "EXPIRE") {
      const key = String(args[0]);
      const ex = Number(args[1]);
      const cur = this._prune(key);
      if (!cur) return 0;
      cur.expiresAt = this._now() + ex * 1000;
      return 1;
    }

    if (cmd === "EXISTS") {
      return args.filter((k) => this.getRaw(String(k)) !== null).length;
    }

    if (cmd === "INCR") {
      const key = String(args[0]);
      const cur = this._prune(key);
      const next = (cur ? Number(cur.value) || 0 : 0) + 1;
      const ttlSec = cur && cur.expiresAt ? Math.max(1, Math.ceil((cur.expiresAt - this._now()) / 1000)) : null;
      this.setRaw(key, String(next), ttlSec);
      return next;
    }

    if (cmd === "DECR") {
      const key = String(args[0]);
      const cur = this._prune(key);
      const next = (cur ? Number(cur.value) || 0 : 0) - 1;
      const ttlSec = cur && cur.expiresAt ? Math.max(1, Math.ceil((cur.expiresAt - this._now()) / 1000)) : null;
      this.setRaw(key, String(next), ttlSec);
      return next;
    }

    if (cmd === "ZADD") {
      const key = String(args[0]);
      let entry = this.zsets.get(key);
      if (!entry) {
        entry = { zset: new Map(), expiresAt: null };
        this.zsets.set(key, entry);
      }
      for (let i = 1; i + 1 < args.length; i += 2) {
        const score = Number(args[i]);
        const member = String(args[i + 1]);
        entry.zset.set(member, score);
      }
      return 1;
    }

    if (cmd === "ZRANGE") {
      const key = String(args[0]);
      const entry = this.zsets.get(key);
      if (!entry) return [];
      const sorted = [...entry.zset.entries()].sort((a, b) => a[1] - b[1]);
      return sorted.map((x) => x[0]);
    }

    if (cmd === "EVALSHA") {
      throw new Error("NOSCRIPT No matching script. Please use EVAL.");
    }

    if (cmd === "EVAL") {
      const script = String(args[0]);
      const numKeys = Number(args[1]);
      const keys = args.slice(2, 2 + numKeys).map(String);
      const argv = args.slice(2 + numKeys);
      return this.execEval(script, keys, argv);
    }

    throw new Error(`Unsupported mock Redis command: ${cmd}`);
  }

  execEval(script, keys, argv) {
    // 1) Interview Session RESERVE_EVAL_LUA
    if (script.includes("EVAL_IN_PROGRESS") && script.includes("FREE_EVAL_LIMIT_EXCEEDED")) {
      const [sessionKey, quotaKey, lockKey] = keys;
      const depth = Number(argv[0] ?? 0);
      const lockToken = String(argv[1] || "");
      const lockTtl = Number(argv[2] || 60);

      const sessionRaw = this.getRaw(sessionKey);
      if (!sessionRaw) {
        return JSON.stringify({
          ok: false,
          status: 410,
          code: "SESSION_EXPIRED",
          message: "면접 세션이 만료되었습니다. 새로 질문을 생성해 주세요.",
        });
      }
      const quotaRaw = this.getRaw(quotaKey);
      if (!quotaRaw) {
        return JSON.stringify({
          ok: false,
          status: 410,
          code: "SESSION_EXPIRED",
          message: "면접 세션 한도 정보가 만료되었습니다.",
        });
      }
      if (this.getRaw(lockKey) !== null) {
        return JSON.stringify({
          ok: false,
          status: 409,
          code: "EVAL_IN_PROGRESS",
          message: "이전 답변 채점이 진행 중입니다. 잠시만 기다려 주세요.",
        });
      }
      const quota = this._tryParse(quotaRaw);
      const isFree = Number(quota.isFree) || 0;
      const maxEval = Number(quota.max) || 45;
      const used = Number(quota.used) || 0;
      const remaining = Number(quota.remaining) || 0;

      if (isFree === 1) {
        if (depth > 0) {
          return JSON.stringify({
            ok: false,
            status: 403,
            code: "FREE_FOLLOWUP_LOCKED",
            message: "꼬리질문 실전 답변 및 2~3단계 연쇄 검증은 유료 시뮬레이터에서 이용할 수 있습니다.",
          });
        }
        if (used >= 1 || remaining < 1) {
          return JSON.stringify({
            ok: false,
            status: 403,
            code: "FREE_EVAL_LIMIT_EXCEEDED",
            message: "무료 체험에서는 1개 질문의 답변 채점과 1단계 꼬리질문 미리보기까지만 제공됩니다.",
          });
        }
      } else if (remaining < 1 || used >= maxEval) {
        return JSON.stringify({
          ok: false,
          status: 429,
          code: "EVALUATION_LIMIT_EXCEEDED",
          message: "세션당 최대 45회(15문항 × 3단계) 답변 채점 한도를 모두 소진했습니다.",
        });
      }

      quota.used = used + 1;
      quota.remaining = remaining - 1;
      const ttl = this.ttl(sessionKey);
      this.setRaw(quotaKey, JSON.stringify(quota), ttl > 0 ? ttl : null);
      this.setRaw(lockKey, lockToken, lockTtl);
      return JSON.stringify({
        ok: true,
        quota,
        sessionRaw: typeof sessionRaw === "string" ? sessionRaw : JSON.stringify(sessionRaw),
      });
    }

    // 2) Interview Session COMMIT_SESSION_LUA
    if (script.includes("local currentLock = redis.call(\"GET\", KEYS[3])") && script.includes("fallbackTtl")) {
      const [sessionKey, _quotaKey, lockKey] = keys;
      const [sessionJson, expectedToken, fallbackTtl] = argv;
      const currentLock = this.getRaw(lockKey);
      if (currentLock !== null && expectedToken !== "" && currentLock !== expectedToken) {
        return 0;
      }
      const ttl = this.ttl(sessionKey);
      this.setRaw(sessionKey, sessionJson, ttl > 0 ? ttl : Number(fallbackTtl || 7200));
      if (expectedToken === "" || currentLock === expectedToken) {
        this.del(lockKey);
      }
      return 1;
    }

    // 3) Interview Session REFUND_EVAL_LUA
    if (script.includes("quota.used = math.max(0, used - 1)")) {
      const [sessionKey, quotaKey, lockKey] = keys;
      const lockToken = String(argv[0] || "");
      const currentLock = this.getRaw(lockKey);
      if (currentLock === lockToken || lockToken === "") {
        this.del(lockKey);
      }
      const quotaRaw = this.getRaw(quotaKey);
      if (!quotaRaw) return JSON.stringify({ ok: false });
      const quota = this._tryParse(quotaRaw);
      const maxEval = Number(quota.max) || 45;
      quota.used = Math.max(0, (Number(quota.used) || 0) - 1);
      quota.remaining = Math.min(maxEval, (Number(quota.remaining) || 0) + 1);
      const ttl = this.ttl(sessionKey);
      this.setRaw(quotaKey, JSON.stringify(quota), ttl > 0 ? ttl : null);
      return JSON.stringify({ ok: true, quota });
    }

    // 4) Free rate limit Lua (redis.ts FREE_RESERVE_LUA / refund)
    if (
      script.includes("if current >= maxReq then") &&
      script.includes('redis.call("INCR", KEYS[1])')
    ) {
      const key = keys[0];
      const maxReq = Number(argv[0] || 1);
      const ttlSec = Number(argv[1] || 86400);
      const current = Number(this.getRaw(key) || "0");
      if (current >= maxReq) {
        return [0, 0, current];
      }
      const updated = current + 1;
      const existingTtl = this.ttl(key);
      this.setRaw(
        key,
        String(updated),
        updated === 1 || existingTtl <= 0 ? ttlSec : existingTtl
      );
      return [1, Math.max(0, maxReq - updated), updated];
    }

    if (
      script.includes("ratelimit") ||
      keys.some((k) => k.includes("ratelimit"))
    ) {
      const key = keys[0];
      const maxReq = Number(argv[0] || 1);
      const current = Number(this.getRaw(key) || "0");
      const next = Math.max(0, current - 1);
      const existingTtl = this.ttl(key);
      this.setRaw(key, String(next), existingTtl > 0 ? existingTtl : 86400);
      return Math.max(0, maxReq - next);
    }

    // 5) Paid Order BEGIN_GENERATION_LUA (orders.ts)
    if (script.includes("remainingGenerations") && script.includes("generating")) {
      const orderKey = keys[0];
      const lockKey = keys[1];
      const orderRaw = this.getRaw(orderKey);
      if (!orderRaw) {
        return JSON.stringify({ ok: false, status: 403, code: "INVALID_ORDER", message: "Forbidden. Invalid payment info or generations exhausted." });
      }
      const order = this._tryParse(orderRaw);
      const nowIso = String(argv[0] || new Date().toISOString());
      const lockTtl = Number(argv[3] || 180);
      const lockToken = String(argv[4] || nowIso);
      const expectedService = argv[7] ? String(argv[7]) : null;

      if (expectedService && order.serviceType && order.serviceType !== expectedService) {
        return JSON.stringify({ ok: false, status: 403, code: "SERVICE_MISMATCH", message: "이용권 서비스 유형이 일치하지 않습니다." });
      }
      if (order.status === "refunded") {
        return JSON.stringify({ ok: false, status: 403, code: "ORDER_REFUNDED", message: "이미 자동 환불 처리되어 무효화된 주문입니다." });
      }
      if (order.status === "refund_failed") {
        return JSON.stringify({ ok: false, status: 409, code: "REFUND_PENDING", message: "환불 처리 중입니다." });
      }
      if ((Number(order.remainingGenerations) || 0) < 1) {
        return JSON.stringify({ ok: false, status: 403, code: "NO_REMAINING", message: "잔여 이용 횟수가 없습니다." });
      }
      if (lockKey && this.getRaw(lockKey) !== null) {
        return JSON.stringify({ ok: false, status: 409, code: "IN_PROGRESS", message: "생성이 진행 중입니다." });
      }
      if (lockKey) {
        this.setRaw(lockKey, lockToken, lockTtl);
      }
      order.remainingGenerations = Number(order.remainingGenerations) - 1;
      order.status = "generating";
      order.generatingStartedAt = nowIso;
      order.activeLockToken = lockToken;
      const ttl = this.ttl(orderKey);
      this.setRaw(orderKey, JSON.stringify(order), ttl > 0 ? ttl : 31536000);
      return JSON.stringify({ ok: true, order });
    }

    // 6) Paid Order persistOrderAndReleaseLock (orders.ts)
    if (
      script.includes('local currentLock = redis.call("GET", KEYS[2])') &&
      script.includes("forceSave")
    ) {
      const [orderKey, lockKey] = keys;
      const [orderJson, expectedToken, forceSave, fallbackTtl] = argv;
      const currentLock = this.getRaw(lockKey);
      if (
        String(forceSave) !== "1" &&
        currentLock !== null &&
        String(expectedToken || "") !== "" &&
        currentLock !== String(expectedToken)
      ) {
        return 0;
      }
      const ttl = this.ttl(orderKey);
      this.setRaw(orderKey, orderJson, ttl > 0 ? ttl : Number(fallbackTtl || 31536000));
      if (String(expectedToken || "") === "" || currentLock === String(expectedToken)) {
        this.del(lockKey);
      }
      return 1;
    }

    throw new Error(
      `Unhandled EVAL script (${keys.join(", ")}): ${script.slice(0, 260).replace(/\s+/g, " ")}`
    );
  }
}

const mockStore = new MockUpstashStore();

function startUpstashMockServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        res.setHeader("Content-Type", "application/json");
        try {
          const urlPath = (req.url || "/").split("?")[0];
          const parsed = body ? JSON.parse(body) : [];
          if (urlPath === "/pipeline" || urlPath === "/multi-exec") {
            const results = parsed.map((cmdArr) => {
              try {
                return { result: mockStore.execCommand(cmdArr) };
              } catch (err) {
                return { error: err.message };
              }
            });
            res.statusCode = 200;
            res.end(JSON.stringify(results));
            return;
          }
          const result = mockStore.execCommand(parsed);
          res.statusCode = 200;
          res.end(JSON.stringify({ result }));
        } catch (err) {
          console.error("[MockUpstash ERROR]", err.message, "BODY:", body.slice(0, 300));
          res.statusCode = 400;
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve({ server, port: addr.port });
    });
  });
}

// ── 2. Fetch interceptor for Toss & Resend (Gemini & localhost stay real!) ──
const capturedEmails = [];
const tossCalls = [];

function installExternalApiInterceptor() {
  const realFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    if (urlStr.startsWith("https://api.tosspayments.com/")) {
      const reqBody = init?.body ? JSON.parse(String(init.body)) : {};
      tossCalls.push({ url: urlStr, method: init?.method || "POST", body: reqBody });

      if (urlStr.endsWith("/v1/payments/confirm")) {
        return new Response(
          JSON.stringify({
            paymentKey: reqBody.paymentKey,
            orderId: reqBody.orderId,
            status: "DONE",
            totalAmount: Number(reqBody.amount),
            method: "카드",
            approvedAt: new Date().toISOString(),
            receipt: { url: `https://dashboard.tosspayments.com/receipt/mock/${reqBody.orderId}` },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (urlStr.includes("/cancel")) {
        return new Response(
          JSON.stringify({
            paymentKey: "mock_pk",
            orderId: reqBody.orderId || "mock_order",
            status: "CANCELED",
            cancels: [{ cancelAmount: reqBody.cancelAmount || 4900, canceledAt: new Date().toISOString() }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    if (urlStr.startsWith("https://api.resend.com/emails")) {
      const emailPayload = init?.body ? JSON.parse(String(init.body)) : {};
      capturedEmails.push(emailPayload);
      return new Response(JSON.stringify({ id: `mock_email_${capturedEmails.length}` }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return realFetch(input, init);
  };
}

// ── Test Datasets ──
const SAMPLE_JOB_CATEGORY = "공공기관 경영·회계·사무";
const CANONICAL_RESUME = `
[지원동기 및 직무 경험]
OO공단 체험형 행정인턴으로 6개월간 근무하며 민원 서류 접수 및 경영지원팀 월말 결산 보조 업무를 수행했습니다.
당시 종이 신청서 오기입으로 보완 요청이 잦아 자주 묻는 질문 12개 항목의 체크리스트와 작성 예시 안내판을 직접 정리해 선임 주무관님 검토 후 창구에 비치했고, 그 결과 보완 재접수 건수를 월 42건에서 14건으로 67% 줄였습니다.
또한 동아리 회계 부원으로 1년간 활동하며 영수증 증빙 누락 12건을 발견해 엑셀 SUMIF 대조 시트를 도입해 기한 내 결산을 100% 완료했습니다.
교내 공모전에서는 4인 팀의 자료조사 파트를 맡아 장려상을 수상한 경험이 있습니다.
`.trim();

const BASE_JOB_QUESTION = {
  id: "q1",
  number: 1,
  kind: "job",
  ncsCompetency: "문제해결능력",
  intentSummary: "민원 서류 오기입 문제를 직접 진단하고 개선한 본인의 구체적 역할과 검증 근거 확인",
  question: "인턴 근무 당시 민원 서류 보완 재접수를 줄이기 위해 본인이 직접 판단하고 실행한 조치는 무엇이며, 어떤 기준으로 효과를 검증하셨나요?",
};

const PERSONALITY_QUESTION = {
  id: "q11",
  number: 11,
  kind: "personality",
  ncsCompetency: "직업윤리",
  intentSummary: "공직가치·규정 준수 vs 민원인 편의 갈등 상황에서의 판단 원칙 확인",
  question: "지급 요건 증빙 서류가 1건 부족해 규정상 접수가 불가능한 고령 민원인이 당장 생계가 급하다며 예외 처리를 강하게 요청하신다면 어떻게 대응하시겠습니까?",
};

const CANONICAL_STRONG_ANSWER =
  "제가 창구에서 반복된 민원 서류 오기입을 줄이기 위해 직접 원인부터 분류한 과정이 있습니다. 당시 하루 평균 접수 서류를 일주일간 살펴보니 소득 금액 기재란과 서명 위치 실수가 전체 보완 요청의 대다수였습니다. 선임 주무관님께 현황표를 보고드린 뒤 자주 묻는 12개 항목 중심의 한 장 체크리스트와 붉은색 작성 예시 견본을 직접 제작해 승인을 받았습니다. 이후 창구 대기대 앞에 비치하고 접수 전 1분 사전 안내를 정착시킨 결과 월 42건이던 보완 재접수가 14건으로 약 67% 감소했습니다. 이 기준은 인턴 종료 시 인수인계 매뉴얼에도 반영해 다른 창구에서도 동일하게 활용할 수 있도록 남겼습니다.";

async function main() {
  const { server: redisServer, port: redisPort } = await startUpstashMockServer();
  process.env.UPSTASH_REDIS_REST_URL = `http://127.0.0.1:${redisPort}`;
  process.env.UPSTASH_REDIS_REST_TOKEN = "mock_upstash_token";
  process.env.TOSS_SECRET_KEY = "test_sk_mock_key";
  process.env.NEXT_PUBLIC_SITE_URL = "http://127.0.0.1:3000";
  process.env.RESEND_API_KEY = "re_mock_key";
  process.env.EMAIL_FROM = "noreply@korea-resume.com";

  installExternalApiInterceptor();

  const jiti = createJiti(import.meta.url, {
    alias: { "@": path.resolve(process.cwd(), "src") },
    interopDefault: true,
  });

  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  const imp = (relPath) => jiti.import(path.resolve(process.cwd(), relPath));

  const { evaluateInterviewAnswerWithAI } = await imp("src/lib/interviewGenerator.ts");
  const { buildInterviewEvaluationReport, buildFreeEvaluationResponse } = await imp(
    "src/lib/interviewRubric.ts"
  );
  const { findUnverifiedMetrics } = await imp("src/lib/textMetrics.ts");

  const payRoute = await imp("src/app/api/interview/payment/route.ts");
  const genRoute = await imp("src/app/api/interview/generate/route.ts");
  const evalRoute = await imp("src/app/api/interview/evaluate/route.ts");
  const sessionRoute = await imp("src/app/api/interview/session/route.ts");
  const resultRoute = await imp("src/app/api/result/[orderId]/route.ts");

  const reportSummary = {
    executedAt: new Date().toISOString(),
    repeatability: [],
    weakVsStrong: { weak: [], strong: [], personalityScaling: null },
    consistencyBenchmark: { consistent: [], mismatched: [], detectionRate: null, falsePositiveRate: null },
    followUpChains: [],
    e2eApiFlow: {},
  };

  const onlyE2E = process.argv.includes("--only-e2e");
  const runSection = (num) => !onlyE2E || num === 5;

  const strongAnswers = [
    {
      label: "Strong-1 (민원 오기입 진단·체크리스트·수치)",
      text: CANONICAL_STRONG_ANSWER,
    },
    {
      label: "Strong-2 (회계 영수증 누락 12건·SUMIF 대조시트)",
      text: "동아리 회계 부원으로 결산을 맡았을 때 월말마다 증빙 영수증 12건이 누락되어 잔액이 맞지 않는 문제가 반복됐습니다. 저는 수기 장부와 통장 거래내역 간 대조 절차가 없는 점을 원인으로 보고, 엑셀 SUMIF 함수로 지출 결의 번호별 자동 검증 시트를 직접 설계했습니다. 매주 금요일 중간 정산 마감 규칙을 팀원들에게 공지해 적용한 결과 누락 12건을 모두 보완하고 기한 내 결산 완료율 100%를 달성했습니다.",
    },
    {
      label: "Strong-3 (공모전 자료조사·실행 기준)",
      text: "4인 팀 공모전에서 주제가 너무 추상적이라는 심사평 위험이 있어 제가 자료조사 파트를 총괄하며 공단 최근 3개년 사업보고서와 민원 통계 기준으로 우선순위를 다시 세웠습니다. 팀원별 근거 자료 교차 검증 체크표를 만들어 발표 직전 수치 오류 2건을 사전에 바로잡았고, 그 결과 교내 장려상을 수상하며 근거 기반 보고서 작성의 중요성을 체득했습니다.",
    },
  ];
  const freeFollowUpSampleAnswer =
    "체크리스트 제작 전에는 과거 민원 보완 대장 한 달 치를 직접 전수 분류해 오기입 유형 상위 12가지를 추렸습니다. 주무관님께는 1장 양면 견본이 예산 추가 없이 프린터 출력만으로 가능함을 말씀드려 즉시 승인을 받았습니다.";

  if (runSection(1)) {
  console.log("=== [1/5] 3x Repeatability Check ===");
  for (let i = 1; i <= 3; i++) {
    const ai = await evaluateInterviewAnswerWithAI({
      genAI,
      jobCategory: SAMPLE_JOB_CATEGORY,
      question: BASE_JOB_QUESTION,
      currentPromptQuestion: BASE_JOB_QUESTION.question,
      depth: 0,
      resumeText: CANONICAL_RESUME,
      userAnswer: CANONICAL_STRONG_ANSWER,
      generateNextFollowUp: true,
    });
    const rep = buildInterviewEvaluationReport({
      questionKind: "job",
      resumeText: CANONICAL_RESUME,
      userAnswer: CANONICAL_STRONG_ANSWER,
      allowedSourceText: `${CANONICAL_RESUME}\n${CANONICAL_STRONG_ANSWER}`,
      depth: 0,
      aiEval: ai.evaluation,
    });
    reportSummary.repeatability.push({
      run: i,
      totalScore: rep.totalScore,
      grade: rep.grade,
      categories: Object.fromEntries(rep.categories.map((c) => [c.key, c.score])),
      durationMs: ai.durationMs,
      usedModel: ai.usedModel,
    });
  }
  const repScores = reportSummary.repeatability.map((r) => r.totalScore);
  const repSpread = Math.max(...repScores) - Math.min(...repScores);
  console.log("Repeatability scores:", repScores, "spread:", repSpread);

  console.log("\n=== [2/5] Weak (40~60) vs Strong (75~90+) & Personality 85->100 Scaling ===");
  const weakAnswers = [
    {
      label: "Weak-1 (168자: 방향은 맞으나 구체 행동·근거·수치 부족)",
      text: "인턴 근무 당시 민원 서류에 실수가 자주 발생해 저도 안내 업무를 열심히 도와드렸습니다. 주무관님 말씀에 따라 서류 내용을 꼼꼼히 다시 읽어보고 민원인분들께 친절하게 설명드리려고 노력했습니다. 팀원들과도 원활하게 소통하면서 분위기를 좋게 유지했고, 그 덕분에 큰 문제 없이 인턴 기간을 무사히 마칠 수 있었습니다.",
    },
    {
      label: "Weak-2 (165자: 협업 위주 주어불명·개인 기여 모호)",
      text: "저희 팀이 다 같이 회의를 진행하면서 민원 서류 보완 문제가 왜 생기는지 이야기를 나눴습니다. 조금 힘든 부분도 있었지만 서로 양보하고 협력해서 안내 자료를 함께 정리해 나갔습니다. 그 과정을 거치면서 자연스럽게 보완 요청이 줄어드는 효과를 봤고 공공기관에서는 협업이 중요하다는 것을 배웠습니다.",
    },
    {
      label: "Weak-3 (162자: 일반 다짐 위주·질문 직답 미흡)",
      text: "민원 업무에서는 정확성과 친절함이 가장 중요하다고 생각합니다. 그래서 저는 인턴 시절 항상 밝은 표정으로 민원인을 응대하고 시간 약속을 철저히 지켰습니다. 또한 서류 작성 시 오기입이 생기지 않도록 제가 직접 먼저 꼼꼼히 확인하려 애썼으며, 입사 후에도 원칙을 지키는 직원이 되겠습니다.",
    },
  ];

  const strongAnswers = [
    {
      label: "Strong-1 (민원 오기입 진단·체크리스트·수치)",
      text: CANONICAL_STRONG_ANSWER,
    },
    {
      label: "Strong-2 (회계 영수증 누락 12건·SUMIF 대조시트)",
      text: "동아리 회계 부원으로 결산을 맡았을 때 월말마다 증빙 영수증 12건이 누락되어 잔액이 맞지 않는 문제가 반복됐습니다. 저는 수기 장부와 통장 거래내역 간 대조 절차가 없는 점을 원인으로 보고, 엑셀 SUMIF 함수로 지출 결의 번호별 자동 검증 시트를 직접 설계했습니다. 매주 금요일 중간 정산 마감 규칙을 팀원들에게 공지해 적용한 결과 누락 12건을 모두 보완하고 기한 내 결산 완료율 100%를 달성했습니다.",
    },
    {
      label: "Strong-3 (공모전 자료조사·실행 기준)",
      text: "4인 팀 공모전에서 주제가 너무 추상적이라는 심사평 위험이 있어 제가 자료조사 파트를 총괄하며 공단 최근 3개년 사업보고서와 민원 통계 기준으로 우선순위를 다시 세웠습니다. 팀원별 근거 자료 교차 검증 체크표를 만들어 발표 직전 수치 오류 2건을 사전에 바로잡았고, 그 결과 교내 장려상을 수상하며 근거 기반 보고서 작성의 중요성을 체득했습니다.",
    },
  ];

  for (const w of weakAnswers) {
    const ai = await evaluateInterviewAnswerWithAI({
      genAI,
      jobCategory: SAMPLE_JOB_CATEGORY,
      question: BASE_JOB_QUESTION,
      currentPromptQuestion: BASE_JOB_QUESTION.question,
      depth: 0,
      resumeText: CANONICAL_RESUME,
      userAnswer: w.text,
      generateNextFollowUp: false,
    });
    const rep = buildInterviewEvaluationReport({
      questionKind: "job",
      resumeText: CANONICAL_RESUME,
      userAnswer: w.text,
      allowedSourceText: `${CANONICAL_RESUME}\n${w.text}`,
      depth: 0,
      aiEval: ai.evaluation,
    });
    reportSummary.weakVsStrong.weak.push({
      label: w.label,
      charCount: rep.charCount,
      totalScore: rep.totalScore,
      grade: rep.grade,
      categories: Object.fromEntries(rep.categories.map((c) => [c.key, c.score])),
      durationMs: ai.durationMs,
    });
  }

  for (const s of strongAnswers) {
    const q = s.label.includes("Strong-2")
      ? {
          ...BASE_JOB_QUESTION,
          id: "q2",
          question: "회계 결산 과정에서 증빙 누락 문제를 해결하기 위해 본인이 도입한 검증 절차와 결과를 말씀해 주세요.",
        }
      : s.label.includes("Strong-3")
        ? {
            ...BASE_JOB_QUESTION,
            id: "q3",
            question: "교내 공모전 4인 팀에서 자료조사 파트를 맡아 수행한 구체적 기준과 협업 과정을 말씀해 주세요.",
          }
        : BASE_JOB_QUESTION;
    const ai = await evaluateInterviewAnswerWithAI({
      genAI,
      jobCategory: SAMPLE_JOB_CATEGORY,
      question: q,
      currentPromptQuestion: q.question,
      depth: 0,
      resumeText: CANONICAL_RESUME,
      userAnswer: s.text,
      generateNextFollowUp: false,
    });
    const rep = buildInterviewEvaluationReport({
      questionKind: "job",
      resumeText: CANONICAL_RESUME,
      userAnswer: s.text,
      allowedSourceText: `${CANONICAL_RESUME}\n${s.text}`,
      depth: 0,
      aiEval: ai.evaluation,
    });
    reportSummary.weakVsStrong.strong.push({
      label: s.label,
      charCount: rep.charCount,
      totalScore: rep.totalScore,
      grade: rep.grade,
      categories: Object.fromEntries(rep.categories.map((c) => [c.key, c.score])),
      durationMs: ai.durationMs,
    });
  }

  const personalityAnswer =
    "공공기관은 법령과 규정 준수가 국민 신뢰의 기본이므로 증빙 서류 미비 상태에서 임의로 예외 접수를 해드릴 수는 없습니다. 먼저 어르신의 급박한 사정에 깊이 공감하며 차분히 경청한 뒤, 규정상 불가 사유를 쉬운 말로 설명드리겠습니다. 동시에 현장에서 즉시 발급 가능한 대체 서류나 유관 기관 긴급 복지 연계 창구가 있는지 바로 확인해 연결해 드리고, 선임자와 협의해 민원인이 헛걸음하지 않도록 재방문 체크리스트를 손글씨로 적어 안내하겠습니다.";
  const pAi = await evaluateInterviewAnswerWithAI({
    genAI,
    jobCategory: SAMPLE_JOB_CATEGORY,
    question: PERSONALITY_QUESTION,
    currentPromptQuestion: PERSONALITY_QUESTION.question,
    depth: 0,
    resumeText: CANONICAL_RESUME,
    userAnswer: personalityAnswer,
    generateNextFollowUp: false,
  });
  const pRep = buildInterviewEvaluationReport({
    questionKind: "personality",
    resumeText: CANONICAL_RESUME,
    userAnswer: personalityAnswer,
    allowedSourceText: `${CANONICAL_RESUME}\n${personalityAnswer}`,
    depth: 0,
    aiEval: pAi.evaluation,
  });
  reportSummary.weakVsStrong.personalityScaling = {
    questionKind: "personality",
    consistencyStatusLabel: pRep.consistency.statusLabel,
    consistencyApplicable: pRep.consistency.applicable,
    consistencyScore: pRep.consistency.score,
    rawScore85: pRep.rawScore85,
    expectedScaled100: Math.round((pRep.rawScore85 / 85) * 100),
    actualTotalScore: pRep.totalScore,
    scoreFormulaNote: pRep.scoreFormulaNote,
    durationMs: pAi.durationMs,
  };
  console.log("Weak scores:", reportSummary.weakVsStrong.weak.map((x) => x.totalScore));
  console.log("Strong scores:", reportSummary.weakVsStrong.strong.map((x) => x.totalScore));
  console.log("Personality 85->100 scaling:", reportSummary.weakVsStrong.personalityScaling);

  console.log("\n=== [3/5] Consistency Benchmark (Consistent 5 vs Mismatched 5) ===");
  const consistencyPairs = [
    // Consistent 5
    {
      id: "C1",
      expectedMismatch: false,
      resume: "OO공단 체험형 행정인턴 기간(6개월) 동안 민원 서류 분류 매뉴얼 초안을 선임 주무관 지시에 따라 보조 작성해 보완 재접수 건수를 월 42건에서 14건으로 67% 줄였습니다.",
      question: "행정인턴 당시 민원 매뉴얼 작업에서 본인이 맡은 역할과 결과는 무엇이었나요?",
      answer: "6개월 인턴 기간에 제가 선임 주무관님 지시 아래 민원인이 자주 헷갈리는 서류 12개 항목을 먼저 정리해 매뉴얼 초안 보조 작성을 맡았습니다. 창구에 비치한 뒤로는 보완 재접수 건수가 월 42건에서 14건으로 약 67% 줄어드는 데 보탬이 됐습니다.",
    },
    {
      id: "C2",
      expectedMismatch: false,
      resume: "동아리 회계 부원으로 1년간 활동하며 영수증 증빙 누락 12건을 발견해 엑셀 SUMIF 대조표를 만들어 기한 내 결산을 완료했습니다.",
      question: "동아리 회계 활동 중 문제를 개선한 경험을 말씀해 주세요.",
      answer: "1년 동안 회계 부원으로 일하면서 수기 영수증 관리 때문에 증빙 12건이 빠진 것을 확인했습니다. 그래서 지출 번호와 통장 입출금 내역을 비교하는 엑셀 SUMIF 검증표를 새로 추가해 누락분을 모두 회수하고 마감 기한 안에 결산을 마쳤습니다.",
    },
    {
      id: "C3",
      expectedMismatch: false,
      resume: "교내 캡스톤 프로젝트 4인 팀에서 저는 사전 자료조사와 최종 발표 슬라이드 구성을 맡아 장려상을 수상했습니다.",
      question: "캡스톤 프로젝트에서 본인의 구체적 기여를 말씀해 주세요.",
      answer: "4명 팀원 중 저는 공공데이터와 유관기관 보고서를 모아 근거를 정리하는 자료조사 역할과 최종 발표용 슬라이드 구성 파트를 맡았습니다. 덕분에 팀이 심사에서 논리성을 인정받아 장려상을 수상했습니다.",
    },
    {
      id: "C4",
      expectedMismatch: false,
      resume: "고객센터 단기 아르바이트에서 일 평균 45건의 유선 문의를 응대하며 자주 묻는 환불 안내 문구를 정리했습니다.",
      question: "고객 응대 아르바이트에서 업무 효율을 높인 사례가 있나요?",
      answer: "하루 약 45통씩 전화 상담을 하다 보니 배송비 환불 절차를 묻는 전화가 가장 많았습니다. 그래서 상담 전 빠르게 안내할 수 있도록 3줄짜리 표준 응대 문구를 정리해 매니저님께 공유했습니다.",
    },
    {
      id: "C5",
      expectedMismatch: false,
      resume: "대학교 도서관 근로장학생으로 1년간 근무하며 신착 도서 서가 안내 표지판을 재배치했습니다.",
      question: "도서관 근로 경험 중 개선 활동을 한 사례가 있나요?",
      answer: "1년 동안 데스크 근로장학생으로 일하면서 신착 도서 코너 위치를 묻는 학생이 많아 사서 선생님 허락을 받아 안내 표지판을 주 출입구 눈높이 위치로 옮겨 부착했습니다.",
    },
    // Mismatched 5
    {
      id: "M1 (역할 과장)",
      expectedMismatch: true,
      resume: "OO공단 체험형 행정인턴 기간(6개월) 동안 선배 주무관의 지시에 따라 단순 자료 취합과 복사 등 보조 업무를 수행했습니다.",
      question: "행정인턴 기간에 어떤 업무를 주도하셨나요?",
      answer: "저는 그 6개월 동안 공단 예산기획부 총괄 팀장 역할을 맡아 지자체 예산 100억 원 집행과 사업 최종 결재를 제가 단독으로 결정해 처리했습니다.",
    },
    {
      id: "M2 (수치 과장)",
      expectedMismatch: true,
      resume: "학내 동아리 홍보 부원으로 참여해 인스타그램 카드뉴스 5건을 제작했고 팔로워가 80명 늘었습니다.",
      question: "홍보 부원으로서 거둔 정량 성과가 궁금합니다.",
      answer: "제가 동아리 SNS 채널을 전면 개편해서 카드뉴스 200건을 직접 올렸고, 그 결과 팔로워 15,000명을 달성하며 조회수 900% 증가를 이끌었습니다.",
    },
    {
      id: "M3 (기간 왜곡)",
      expectedMismatch: true,
      resume: "여름방학 4주간의 단기 체험형 인턴에서 민원실 안내 및 번호표 배부 보조 업무를 경험했습니다.",
      question: "해당 기관 근무 경력에 대해 말씀해 주세요.",
      answer: "저는 해당 공공기관에서 2년 6개월 동안 정규직 대리로 장기 근무하면서 인사 평가와 노무 규정 개정 프로젝트 전체를 책임졌습니다.",
    },
    {
      id: "M4 (기여도·도구 왜곡)",
      expectedMismatch: true,
      resume: "캡스톤 5인 팀에서 저는 회의록 작성과 일정 연락만 담당했고, Python 데이터 분석 코드는 다른 팀원 2명이 전부 구현했습니다.",
      question: "캡스톤에서 데이터 분석 구현은 본인이 직접 하셨나요?",
      answer: "네, 팀에서 5명 몫의 Python 머신러닝 예측 모델 코드와 데이터베이스 파이프라인 전체를 제가 처음부터 끝까지 혼자 코딩하고 구축했습니다.",
    },
    {
      id: "M5 (결과 왜곡)",
      expectedMismatch: true,
      resume: "교내 정책 아이디어 공모전에 기획서를 제출했으나 1차 예선 심사에서 아쉽게 탈락하며 논리 보완의 필요성을 배웠습니다.",
      question: "교내 공모전에서는 어떤 결과를 얻으셨나요?",
      answer: "그 공모전에서 제가 최고상인 대상을 수상해 상금 500만 원을 받았고, 바로 기관 시범사업으로 정식 채택되어 운영 팀장까지 맡았습니다.",
    },
  ];

  for (const pair of consistencyPairs) {
    const q = {
      ...BASE_JOB_QUESTION,
      id: `cons_${pair.id}`,
      question: pair.question,
    };
    const ai = await evaluateInterviewAnswerWithAI({
      genAI,
      jobCategory: SAMPLE_JOB_CATEGORY,
      question: q,
      currentPromptQuestion: q.question,
      depth: 0,
      resumeText: pair.resume,
      userAnswer: pair.answer,
      generateNextFollowUp: false,
    });
    const rep = buildInterviewEvaluationReport({
      questionKind: "job",
      resumeText: pair.resume,
      userAnswer: pair.answer,
      allowedSourceText: `${pair.resume}\n${pair.answer}`,
      depth: 0,
      aiEval: ai.evaluation,
    });
    const detected = rep.consistency.statusLabel === "불일치 발견";
    const row = {
      id: pair.id,
      expectedMismatch: pair.expectedMismatch,
      statusLabel: rep.consistency.statusLabel,
      score: rep.consistency.score,
      mismatchCount: rep.consistency.mismatches.length,
      mismatches: rep.consistency.mismatches,
    };
    if (pair.expectedMismatch) {
      reportSummary.consistencyBenchmark.mismatched.push(row);
    } else {
      reportSummary.consistencyBenchmark.consistent.push(row);
    }
    console.log(`Consistency ${pair.id}: expected=${pair.expectedMismatch}, detected=${detected}, mismatches=${rep.consistency.mismatches.length}`);
  }

  const tp = reportSummary.consistencyBenchmark.mismatched.filter(
    (r) => r.statusLabel === "불일치 발견"
  ).length;
  const fp = reportSummary.consistencyBenchmark.consistent.filter(
    (r) => r.statusLabel === "불일치 발견"
  ).length;
  reportSummary.consistencyBenchmark.detectionRate = `${tp}/5 (${(tp / 5) * 100}%)`;
  reportSummary.consistencyBenchmark.falsePositiveRate = `${fp}/5 (${(fp / 5) * 100}%)`;

  console.log("\n=== [4/5] 3x Dynamic Follow-Up Chain (1->2->3) + Zero Unverified Metrics ===");
  const chainConfigs = [
    {
      name: "Chain-1 (직무: 민원 서류 체크리스트)",
      question: BASE_JOB_QUESTION,
      answersByDepth: [
        CANONICAL_STRONG_ANSWER,
        "체크리스트 제작 전에는 과거 민원 보완 대장 한 달 치를 직접 전수 분류해 오기입 유형 상위 12가지를 추렸습니다. 주무관님께는 1장 양면 견본이 예산 추가 없이 프린터 출력만으로 가능함을 말씀드려 즉시 승인을 받았고, 동료 인턴 1명과 번갈아 민원인에게 안내했습니다.",
        "사실 처음 일주일은 글자가 작다는 어르신 민원이 있어 14포인트 이상 큰 글씨와 형광 표시로 다시 수정했습니다. 또한 법정 서식이 바뀔 수 있으므로 매월 초 주무관님 확인란을 체크리스트 하단에 두어 임의 안내 리스크를 차단했습니다.",
        "규정 개정으로 기존 견본과 달라지는 경우를 막기 위해 공문 접수 시 인턴 인수인계 폴더의 원본 파일을 당일 수정하고 날짜 버전을 적는 절차를 만들었습니다. 만약 오안내가 발생했다면 즉시 사과드리고 담당 주무관님과 함께 정정 접수와 우편 보완 안내까지 책임지고 처리하겠습니다.",
      ],
    },
    {
      name: "Chain-2 (직무: 회계 SUMIF 검증 시트)",
      question: {
        ...BASE_JOB_QUESTION,
        id: "q2",
        ncsCompetency: "수리능력",
        question: "동아리 회계 결산 시 영수증 누락 12건을 어떻게 발견하고 대조 시트를 정착시키셨나요?",
      },
      answersByDepth: [
        strongAnswers[1].text,
        "총 지출 건수를 통장 출금 내역과 1대1로 맞추면서 카드 승인번호와 영수증 일자가 불일치한 12건을 찾아냈습니다. 누락자 대부분이 주말 행사 뒤 영수증을 분실한 경우라 행사 직후 48시간 이내 메신저 사진 제출 기준을 함께 정했습니다.",
        "전용 회계 프로그램을 도입하기에는 동아리 예산과 무료 사용 기간 제약이 있어 추가 비용 없이 누구나 열 수 있는 엑셀 SUMIF 대조 시트를 선택했습니다. 함수 오작동을 막기 위해 입력 셀에는 데이터 유효성 목록과 잠금 서식을 적용했습니다.",
        "기말 인수인계 시 후임 회계 부원에게 30분 실습과 테스트 더미 파일 검증을 진행해 개인 역량에 의존하지 않도록 했습니다. 만약 증빙 불가 지출이 끝내 확인되지 않으면 회칙에 따라 집행 당사자 확인서와 임원진 의결 절차로 투명하게 소명하도록 기준을 세웠습니다.",
      ],
    },
    {
      name: "Chain-3 (인성: 규정 vs 민원인 갈등)",
      question: PERSONALITY_QUESTION,
      answersByDepth: [
        personalityAnswer,
        "어르신이 당장 급하시더라도 법적 서류 없이 접수하면 심사 단계에서 부적격 반려되어 오히려 지원 시기가 더 늦어집니다. 그래서 안 된다는 말보다 가장 빠르게 요건을 맞출 수 있는 정부24 무인민원발급기 동행이나 가족 대리 발급 절차부터 우선 확인해 드리겠습니다.",
        "만약 현장 대기가 길어 다른 민원인들의 불만이 커진다면, 1차로 어르신께 잠깐 대기 좌석 안내와 순번 유지를 약속드리고 일반 단순 민원부터 빠르게 소화한 뒤 별도 상담 창구나 선임 담당자 연결로 병목을 분산하겠습니다.",
        "규정상 절대 예외가 불가능한데도 끝까지 특혜성 처리를 요구하신다면 공직윤리 원칙상 절대 수용할 수 없습니다. 정중하지만 단호하게 관련 법령 조항을 안내하고, 이의신청 절차와 긴급복지 129 상담 창구 등 공식 구제 수단을 서면으로 드려 공정성과 친절을 함께 지키겠습니다.",
      ],
    },
  ];

  for (const chain of chainConfigs) {
    let promptQ = chain.question.question;
    const history = [];
    const steps = [];
    let unverifiedTotal = 0;

    for (let d = 0; d <= 3; d++) {
      const userAns = chain.answersByDepth[d];
      const ai = await evaluateInterviewAnswerWithAI({
        genAI,
        jobCategory: SAMPLE_JOB_CATEGORY,
        question: chain.question,
        currentPromptQuestion: promptQ,
        depth: d,
        resumeText: CANONICAL_RESUME,
        userAnswer: userAns,
        priorHistory: history,
        generateNextFollowUp: d < 3,
      });
      const allowedText = [CANONICAL_RESUME, userAns, ...history.map((h) => h.userAnswer)].join("\n");
      const rep = buildInterviewEvaluationReport({
        questionKind: chain.question.kind,
        resumeText: CANONICAL_RESUME,
        userAnswer: userAns,
        allowedSourceText: allowedText,
        depth: d,
        aiEval: ai.evaluation,
      });

      const unverifiedInModelAnswer = findUnverifiedMetrics(rep.modelAnswer || "", allowedText);
      const unverifiedInFeedback = findUnverifiedMetrics(
        `${rep.feedback3Lines.join(" ")} ${rep.digPoint}`,
        allowedText
      );
      unverifiedTotal += unverifiedInModelAnswer.length + unverifiedInFeedback.length;

      const freePreviewCheck =
        d === 0 ? buildFreeEvaluationResponse(rep) : null;

      steps.push({
        depth: d,
        askedQuestion: promptQ,
        totalScore: rep.totalScore,
        consistencyStatus: rep.consistency.statusLabel,
        unverifiedMetricsInModelAnswer: unverifiedInModelAnswer,
        unverifiedMetricsInFeedback: unverifiedInFeedback,
        nextFollowUp: rep.nextFollowUp,
        freeMaskingValid: freePreviewCheck
          ? freePreviewCheck.modelAnswer === null && freePreviewCheck.modelAnswerLocked === true
          : null,
        durationMs: ai.durationMs,
      });

      history.push({ depth: d, question: promptQ, userAnswer: userAns });
      if (rep.nextFollowUp) {
        promptQ = rep.nextFollowUp.question;
      }
    }

    reportSummary.followUpChains.push({
      name: chain.name,
      unverifiedTotal,
      steps,
    });
    console.log(`${chain.name}: steps=${steps.length}, finalNextFollowUp=${steps[3].nextFollowUp}, unverifiedTotal=${unverifiedTotal}`);
  }
  } // end if (runSection(1))

  console.log("\n=== [5/5] E2E API Flow (Payment -> Paid 15Q -> Error Rollback -> 45th/46th 429 -> Result Auto-Sync -> 7d Session Resume) ===");
  const e2eOrderId = `TEST_P16A_${Date.now()}`;
  const validTokenHeaders = { "Content-Type": "application/json" };

  // 5a) Wrong amount rejected on /api/interview/payment
  const badPayRes = await payRoute.POST(
    new Request("http://127.0.0.1:3000/api/interview/payment", {
      method: "POST",
      headers: validTokenHeaders,
      body: JSON.stringify({
        paymentKey: "pk_bad",
        orderId: `${e2eOrderId}_BAD`,
        amount: 3000,
      }),
    })
  );
  const badPayJson = await badPayRes.json();

  // 5b) Confirm 4900 payment
  const okPayRes = await payRoute.POST(
    new Request("http://127.0.0.1:3000/api/interview/payment", {
      method: "POST",
      headers: validTokenHeaders,
      body: JSON.stringify({
        paymentKey: "pk_test_p16a_4900",
        orderId: e2eOrderId,
        amount: 4900,
        email: "applicant@example.com",
      }),
    })
  );
  const okPayJson = await okPayRes.json();
  console.log("okPayRes:", okPayRes.status, okPayJson);

  // 5c) Generate paid 15 questions
  const paidGenRes = await genRoute.POST(
    new Request("http://127.0.0.1:3000/api/interview/generate", {
      method: "POST",
      headers: validTokenHeaders,
      body: JSON.stringify({
        isFree: false,
        orderId: e2eOrderId,
        jobCategory: SAMPLE_JOB_CATEGORY,
        resumeText: CANONICAL_RESUME,
        email: "applicant@example.com",
      }),
    })
  );
  const paidGenJson = await paidGenRes.json();
  console.log("paidGenRes:", paidGenRes.status, paidGenJson?.error || `questions=${paidGenJson?.questions?.length}, sessionId=${paidGenJson?.sessionId}`);
  const sessionId = paidGenJson.sessionId;
  const resultToken = paidGenJson.resultToken;
  if (!sessionId) {
    throw new Error(`paidGenRes missing sessionId: ${JSON.stringify(paidGenJson)}`);
  }
  const sessionTtlAfterCreate = mockStore.ttl(`interview_session:${sessionId}`);
  const resultTtlAfterCreate = mockStore.ttl(`result:${e2eOrderId}`);

  // 5d) Simulate Gemini error on /api/interview/evaluate -> verify Lua rollback to 45 remaining & lock freed
  const savedKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "invalid_key_trigger_rollback";
  const failEvalRes = await evalRoute.POST(
    new Request("http://127.0.0.1:3000/api/interview/evaluate", {
      method: "POST",
      headers: validTokenHeaders,
      body: JSON.stringify({
        sessionId,
        questionId: "q1",
        depth: 0,
        userAnswer: CANONICAL_STRONG_ANSWER,
      }),
    })
  );
  const failEvalJson = await failEvalRes.json();
  process.env.GEMINI_API_KEY = savedKey;
  const quotaAfterRollback = JSON.parse(mockStore.getRaw(`interview_quota:${sessionId}`));
  const lockAfterRollback = mockStore.getRaw(`lock:interview_session:${sessionId}`);

  // 5e) Simulate concurrent 409 lock test
  mockStore.setRaw(`lock:interview_session:${sessionId}`, "other_req_lock", 60);
  const conflictEvalRes = await evalRoute.POST(
    new Request("http://127.0.0.1:3000/api/interview/evaluate", {
      method: "POST",
      headers: validTokenHeaders,
      body: JSON.stringify({
        sessionId,
        questionId: "q1",
        depth: 0,
        userAnswer: CANONICAL_STRONG_ANSWER,
      }),
    })
  );
  const conflictEvalJson = await conflictEvalRes.json();
  mockStore.del(`lock:interview_session:${sessionId}`);

  // 5f) Run real evaluation via /api/interview/evaluate (depth 0 -> remaining 44) & check result:* auto-update
  const eval1Res = await evalRoute.POST(
    new Request("http://127.0.0.1:3000/api/interview/evaluate", {
      method: "POST",
      headers: validTokenHeaders,
      body: JSON.stringify({
        sessionId,
        questionId: "q1",
        depth: 0,
        userAnswer: CANONICAL_STRONG_ANSWER,
      }),
    })
  );
  const eval1Json = await eval1Res.json();

  const resCheckAfterEval = await resultRoute.GET(
    new Request(`http://127.0.0.1:3000/api/result/${e2eOrderId}?token=${resultToken}`),
    { params: { orderId: e2eOrderId } }
  );
  const resJsonAfterEval = await resCheckAfterEval.json();

  // 5g) Drain quota to 44 used / 1 remaining -> run 45th eval -> run 46th eval and assert 429
  mockStore.setRaw(
    `interview_quota:${sessionId}`,
    JSON.stringify({ isFree: 0, max: 45, used: 44, remaining: 1 }),
    sessionTtlAfterCreate
  );
  const eval45Res = await evalRoute.POST(
    new Request("http://127.0.0.1:3000/api/interview/evaluate", {
      method: "POST",
      headers: validTokenHeaders,
      body: JSON.stringify({
        sessionId,
        questionId: "q2",
        depth: 0,
        userAnswer: strongAnswers[1].text,
      }),
    })
  );
  const eval45Json = await eval45Res.json();

  const eval46Res = await evalRoute.POST(
    new Request("http://127.0.0.1:3000/api/interview/evaluate", {
      method: "POST",
      headers: validTokenHeaders,
      body: JSON.stringify({
        sessionId,
        questionId: "q3",
        depth: 0,
        userAnswer: strongAnswers[2].text,
      }),
    })
  );
  const eval46Json = await eval46Res.json();

  // 5h) 7-day Session Resumption GET /api/interview/session (bad token 403 -> valid token 200)
  const badResumeRes = await sessionRoute.GET(
    new Request(`http://127.0.0.1:3000/api/interview/session?orderId=${e2eOrderId}&token=wrong_token`)
  );
  const okResumeRes = await sessionRoute.GET(
    new Request(`http://127.0.0.1:3000/api/interview/session?orderId=${e2eOrderId}&token=${resultToken}`)
  );
  const okResumeJson = await okResumeRes.json();

  // 5i) Free tier test: 3 questions + 2h TTL + 1 eval (modelAnswer=null) + depth>0 403 + daily 2nd gen 429
  const freeGen1Res = await genRoute.POST(
    new Request("http://127.0.0.1:3000/api/interview/generate", {
      method: "POST",
      headers: { ...validTokenHeaders, "x-forwarded-for": "203.0.113.77" },
      body: JSON.stringify({
        isFree: true,
        jobCategory: SAMPLE_JOB_CATEGORY,
        resumeText: CANONICAL_RESUME,
      }),
    })
  );
  const freeGen1Json = await freeGen1Res.json();
  const freeSessionTtl = mockStore.ttl(`interview_session:${freeGen1Json.sessionId}`);

  const freeEvalRes = await evalRoute.POST(
    new Request("http://127.0.0.1:3000/api/interview/evaluate", {
      method: "POST",
      headers: validTokenHeaders,
      body: JSON.stringify({
        sessionId: freeGen1Json.sessionId,
        questionId: "q1",
        depth: 0,
        userAnswer: CANONICAL_STRONG_ANSWER,
      }),
    })
  );
  const freeEvalJson = await freeEvalRes.json();

  const freeFollowUpLockedRes = await evalRoute.POST(
    new Request("http://127.0.0.1:3000/api/interview/evaluate", {
      method: "POST",
      headers: validTokenHeaders,
      body: JSON.stringify({
        sessionId: freeGen1Json.sessionId,
        questionId: "q1",
        depth: 1,
        userAnswer: freeFollowUpSampleAnswer,
      }),
    })
  );
  const freeFollowUpLockedJson = await freeFollowUpLockedRes.json();

  const freeGen2Res = await genRoute.POST(
    new Request("http://127.0.0.1:3000/api/interview/generate", {
      method: "POST",
      headers: { ...validTokenHeaders, "x-forwarded-for": "203.0.113.77" },
      body: JSON.stringify({
        isFree: true,
        jobCategory: SAMPLE_JOB_CATEGORY,
        resumeText: CANONICAL_RESUME,
      }),
    })
  );

  reportSummary.e2eApiFlow = {
    wrongAmountPayment: { status: badPayRes.status, body: badPayJson },
    valid4900Payment: {
      status: okPayRes.status,
      orderId: e2eOrderId,
      remainingGenerations: okPayJson.order?.remainingGenerations,
      statusField: okPayJson.order?.status,
    },
    paidGenerate15Q: {
      status: paidGenRes.status,
      totalQuestions: paidGenJson.questions?.length,
      jobQuestions: paidGenJson.questions?.filter((q) => q.kind === "job").length,
      personalityQuestions: paidGenJson.questions?.filter((q) => q.kind === "personality").length,
      sessionTtlSeconds: sessionTtlAfterCreate,
      resultTtlSeconds: resultTtlAfterCreate,
      initialEmailSent: capturedEmails.length > 0,
      emailSubject: capturedEmails[0]?.subject,
      remainingGenerationsAfterGen: paidGenJson.order?.remainingGenerations,
      usedCountAfterGen: paidGenJson.order?.usedCount,
    },
    evalErrorRollback: {
      status: failEvalRes.status,
      code: failEvalJson.code,
      quotaRestored: failEvalJson.quotaRestored,
      remainingAfterRollback: quotaAfterRollback.remaining,
      usedAfterRollback: quotaAfterRollback.used,
      lockReleased: lockAfterRollback === null,
    },
    concurrentLockConflict: {
      status: conflictEvalRes.status,
      code: conflictEvalJson.code,
    },
    eval1AndResultAutoSync: {
      evalStatus: eval1Res.status,
      remainingEvaluations: eval1Json.remainingEvaluations,
      totalScore: eval1Json.report?.totalScore,
      resultGetStatus: resCheckAfterEval.status,
      noteAnsweredCount: resJsonAfterEval.interviewNote?.answeredCount,
      noteUsedEvaluations: resJsonAfterEval.interviewNote?.usedEvaluations,
      noteRemainingEvaluations: resJsonAfterEval.interviewNote?.remainingEvaluations,
      noteEntriesCount: resJsonAfterEval.interviewNote?.entries?.length,
    },
    quotaExhaustion45And46: {
      eval45Status: eval45Res.status,
      eval45Remaining: eval45Json.remainingEvaluations,
      eval46Status: eval46Res.status,
      eval46Body: eval46Json,
    },
    sevenDaySessionResumption: {
      badTokenStatus: badResumeRes.status,
      validTokenStatus: okResumeRes.status,
      cacheControlHeader: okResumeRes.headers.get("cache-control"),
      referrerPolicyHeader: okResumeRes.headers.get("referrer-policy"),
      restoredQuestionCount: okResumeJson.session?.questions?.length,
      restoredThreadsKeys: Object.keys(okResumeJson.session?.threads || {}),
      restoredUsedEvaluations: okResumeJson.session?.usedEvaluations,
    },
    freeTierLimitsAndMasking: {
      gen1Status: freeGen1Res.status,
      freeQuestionCount: freeGen1Json.questions?.length,
      lockedQuestionCount: freeGen1Json.lockedQuestionCount,
      freeSessionTtlSeconds: freeSessionTtl,
      freeEvalStatus: freeEvalRes.status,
      freeEvalModelAnswer: freeEvalJson.report?.modelAnswer,
      freeEvalModelAnswerLocked: freeEvalJson.report?.modelAnswerLocked,
      freeEvalFollowUpLocked: freeEvalJson.report?.nextFollowUpLocked,
      freeFollowUpAttemptStatus: freeFollowUpLockedRes.status,
      freeFollowUpAttemptCode: freeFollowUpLockedJson.code,
      freeGen2DailyLimitStatus: freeGen2Res.status,
    },
    tossCallsCount: tossCalls.length,
  };

  console.log("\n=== FINAL SUMMARY JSON ===");
  console.log(JSON.stringify(reportSummary, null, 2));

  const outPath = path.resolve(
    `C:/Users/user/.gemini/antigravity/brain/88cdea0e-0021-4958-b1b5-b0172bb0465c/scratch/${onlyE2E ? "verify-p1-6-a-e2e.json" : "verify-p1-6-a-results.json"}`
  );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(reportSummary, null, 2), "utf8");
  console.log("\nSaved full output to:", outPath);

  redisServer.close();
}

main().catch((err) => {
  console.error("FATAL TEST ERROR:", err);
  process.exit(1);
});
