/**
 * P1.6 Phase C Verification Suite
 * - 1분 자기소개 대본 루브릭(250~330자 = 15점, 200~249/331~400자 = 11점, 기타 7점) & 발화 시간 검증
 * - 1분 자기소개 AI 생성 (`POST /api/interview/self-intro`), 무료 잠금(`403`), 채점 및 동적 꼬리질문(`POST /api/interview/evaluate`), 대비 노트(selfIntroEntry) 동기화
 * - Optional `--live`: real Gemini API calls for 1분 자기소개 생성 + 채점
 */

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const jitiModule = require(path.resolve(process.cwd(), "node_modules/jiti"));
const createJiti =
  jitiModule.createJiti || (typeof jitiModule === "function" ? jitiModule : jitiModule.default);

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const rawLine of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

class MockUpstashStore {
  constructor() {
    this.kv = new Map();
    this.zsets = new Map();
  }
  getRaw(k) {
    return this.kv.has(k) ? this.kv.get(k) : null;
  }
  setRaw(k, v) {
    this.kv.set(k, v);
    return "OK";
  }
  exec(cmdArr) {
    const cmd = String(cmdArr[0]).toUpperCase();
    const args = cmdArr.slice(1);
    if (cmd === "GET") return this.getRaw(String(args[0]));
    if (cmd === "MGET") return args.map((k) => this.getRaw(String(k)));
    if (cmd === "SET") return this.setRaw(String(args[0]), args[1]);
    if (cmd === "DEL") {
      let n = 0;
      for (const k of args) if (this.kv.delete(String(k))) n++;
      return n;
    }
    if (cmd === "TTL") return this.kv.has(String(args[0])) ? 604800 : -2;
    if (cmd === "ZADD") return 1;
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
        this.setRaw(lockKey, lockToken);
        order.remainingGenerations = Number(order.remainingGenerations) - 1;
        order.reservedGeneration = true;
        order.generatingLockToken = lockToken;
        order.status = "generating";
        this.setRaw(orderKey, JSON.stringify(order));
        return JSON.stringify({ ok: true, order });
      }
      if (script.includes('local currentLock = redis.call("GET", KEYS[2])') || script.includes('local fallbackTtl = tonumber(ARGV[3])')) {
        const [k, , lockKey] = keys;
        this.setRaw(k, String(argv[0]));
        if (lockKey) this.kv.delete(lockKey);
        return 1;
      }
      if (script.includes("EVAL_IN_PROGRESS")) {
        const [sessionKey, quotaKey, lockKey] = keys;
        const quota = JSON.parse(this.getRaw(quotaKey));
        quota.used += 1;
        quota.remaining -= 1;
        this.setRaw(quotaKey, JSON.stringify(quota));
        this.setRaw(lockKey, String(argv[1]));
        return JSON.stringify({ ok: true, quota, sessionRaw: this.getRaw(sessionKey) });
      }
      if (script.includes("COMMIT_SESSION") || script.includes('local fallbackTtl = tonumber(ARGV[3])')) {
        const [sessionKey, , lockKey] = keys;
        this.setRaw(sessionKey, String(argv[0]));
        this.kv.delete(lockKey);
        return 1;
      }
      throw new Error("Unsupported EVAL: " + script.slice(0, 120));
    }
    throw new Error("Unsupported cmd: " + cmd);
  }
}

const store = new MockUpstashStore();
const server = http.createServer((req, res) => {
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

await new Promise((r) => server.listen(0, "127.0.0.1", r));
process.env.UPSTASH_REDIS_REST_URL = `http://127.0.0.1:${server.address().port}`;
process.env.UPSTASH_REDIS_REST_TOKEN = "mock";

const jiti = createJiti(import.meta.url, {
  alias: { "@": path.join(process.cwd(), "src") },
  interopDefault: true,
});

const rubricMod = await jiti.import(path.join(process.cwd(), "src/lib/interviewRubric.ts"));
const sessionMod = await jiti.import(path.join(process.cwd(), "src/lib/interviewSession.ts"));
const ordersMod = await jiti.import(path.join(process.cwd(), "src/lib/orders.ts"));
const selfIntroRoute = await jiti.import(path.join(process.cwd(), "src/app/api/interview/self-intro/route.ts"));
const evalRoute = await jiti.import(path.join(process.cwd(), "src/app/api/interview/evaluate/route.ts"));
const textMetricsMod = await jiti.import(path.join(process.cwd(), "src/lib/textMetrics.ts"));

try {
  // 1. Self-intro conciseness rubric tests
  const opt285 = "가".repeat(285);
  const cOpt = rubricMod.calculateConcisenessScore(opt285, "self_intro");
  assert.equal(cOpt.score, 15);
  assert.equal(cOpt.label, "1분 적정");
  assert.ok(cOpt.estimatedSpeechSeconds >= 50 && cOpt.estimatedSpeechSeconds <= 60);

  const cMod = rubricMod.calculateConcisenessScore("가".repeat(220), "self_intro");
  assert.equal(cMod.score, 11);
  const cLong = rubricMod.calculateConcisenessScore("가".repeat(460), "self_intro");
  assert.equal(cLong.score, 7);
  console.log("[PASS] 1. 1분 자기소개 루브릭 (250~330자=15점, 발화시간 산출) 통과.");

  // 2. Free session self-intro script generation must be locked (403)
  const freeSess = await sessionMod.createInterviewSession({
    isFree: true,
    orderId: null,
    jobCategory: "공공기관 경영·회계·사무",
    resumeText: "OO공단 행정인턴 6개월 경험. 서류 보완 반려를 42건에서 14건으로 줄였습니다.",
    questions: [
      { id: "q1", number: 1, kind: "job", ncsCompetency: "문제해결능력", intentSummary: "테스트", question: "질문1" },
    ],
  });
  const freeIntroRes = await selfIntroRoute.POST(
    new Request("http://localhost/api/interview/self-intro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: freeSess.sessionId }),
    })
  );
  assert.equal(freeIntroRes.status, 403);
  console.log("[PASS] 2. 무료 세션 AI 1분 자기소개 자동 생성 차단(403) 통과.");

  // 3. Optional live test against real Gemini API
  if (process.argv.includes("--live")) {
    loadEnvLocal();
    assert.ok(process.env.GEMINI_API_KEY, "GEMINI_API_KEY required for --live");

    const resumeText =
      "OO공단 체험형 행정인턴으로 6개월간 근무하며 민원 서류 접수 및 결산 보조를 맡았습니다. 오기입 보완 요청을 줄이기 위해 12개 체크리스트 안내판을 직접 제작해 보완 재접수를 월 42건에서 14건으로 67% 줄였습니다.";

    // Create paid order + completed result so note auto-sync runs
    const { order } = await ordersMod.saveConfirmedOrder({
      orderId: "int_c_live_1",
      serviceType: "interview",
      planType: "interview_single",
      paymentKey: "pk_c_1",
      amount: 4900,
      email: "c@example.com",
    });
    const begin = await ordersMod.beginPaidGeneration({ orderId: order.orderId, serviceType: "interview" });
    const paidSess = await sessionMod.createInterviewSession({
      isFree: false,
      orderId: order.orderId,
      jobCategory: "공공기관 경영·회계·사무",
      jobContext: {
        sn: 999999,
        instName: "국민건강보험공단",
        title: "행정직(일반행정) 신규 채용",
        ncsNames: ["행정·사무", "경영·회계"],
        qualification: "공공서비스 행정 실무 이해자",
      },
      resumeText,
      questions: [
        { id: "q1", number: 1, kind: "job", ncsCompetency: "문제해결능력", intentSummary: "체크리스트 제작 검증", question: "체크리스트 제작 과정을 설명해 주세요." },
      ],
    });
    await ordersMod.completePaidGeneration({
      orderKey: begin.orderKey,
      order: begin.order,
      title: "대비노트",
      text: "초기 노트",
      usedModel: "gemini-4-hydrogen",
      interviewSessionId: paidSess.sessionId,
      interviewNote: sessionMod.compileInterviewPrepNote(paidSess),
    });

    const genIntroRes = await selfIntroRoute.POST(
      new Request("http://localhost/api/interview/self-intro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: paidSess.sessionId }),
      })
    );
    assert.equal(genIntroRes.status, 200);
    const introData = await genIntroRes.json();
    assert.equal(introData.usedModel, "gemini-4-hydrogen");
    assert.deepEqual(textMetricsMod.findUnverifiedMetrics(introData.script, resumeText), []);
    console.log(`[PASS] 3a. Live 1분 자기소개 생성: model=${introData.usedModel}, ${introData.charCount}자 (~${introData.estimatedSpeechSeconds}초), 미검증 수치 0건`);

    // Evaluate the generated self-intro script via /api/interview/evaluate (questionId: "self_intro", depth: 0)
    const evalRes = await evalRoute.POST(
      new Request("http://localhost/api/interview/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: paidSess.sessionId,
          questionId: "self_intro",
          depth: 0,
          userAnswer: introData.script,
        }),
      })
    );
    assert.equal(evalRes.status, 200);
    const evalJson = await evalRes.json();
    assert.equal(evalJson.usedModel, "gemini-3.8-flash");
    assert.equal(evalJson.noteUpdated, true);
    assert.ok(evalJson.report.nextFollowUp?.question, "Self-intro evaluation should yield next follow-up question");

    const updatedSession = await sessionMod.getInterviewSession(paidSess.sessionId);
    const updatedNote = sessionMod.compileInterviewPrepNote(updatedSession);
    assert.ok(updatedNote.selfIntroEntry?.userAnswer);
    const formattedTxt = sessionMod.formatInterviewNoteText(updatedNote);
    assert.ok(formattedTxt.includes("PART 0. 1분 자기소개 대본 및 평가"));
    console.log(`[PASS] 3b. Live 1분 자기소개 채점 & 대비 노트 동기화: score=${evalJson.report.totalScore}점, model=${evalJson.usedModel}, followUp="${evalJson.report.nextFollowUp.question}"`);
  }
} finally {
  server.closeAllConnections?.();
  server.close();
}
