/**
 * Step [3] Automated Regression Test:
 * - Unit tests for sanitizeInterviewQuestionText (15Q-4 "12시간", "10배" & Korean units/particles)
 * - Routing constants check (SCORING_MODEL, FREE_MODEL, WRITING_MODEL, FALLBACK_MODEL)
 * - Optional `--live` mode: executes real Gemini calls via production wrappers
 *   for 15Q-4 (isFree:false), 3Q (isFree:true), diagnose, and evaluateInterviewAnswerWithAI.
 */

import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const REPO_ROOT = process.cwd();
const require = createRequire(path.join(REPO_ROOT, "package.json"));
const jitiModule = require(path.join(REPO_ROOT, "node_modules/jiti"));
const createJiti =
  jitiModule.createJiti || (typeof jitiModule === "function" ? jitiModule : jitiModule.default);

function loadEnvLocal() {
  const envPath = path.join(REPO_ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const rawLine of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

const jiti = createJiti(import.meta.url, {
  alias: { "@": path.join(REPO_ROOT, "src") },
  interopDefault: true,
});

const { GEMINI_CONFIG } = await jiti.import(path.join(REPO_ROOT, "src/lib/gemini.ts"));
const { findUnverifiedMetrics, sanitizeInterviewQuestionText } = await jiti.import(
  path.join(REPO_ROOT, "src/lib/textMetrics.ts")
);
const { generateInterviewQuestionSet, evaluateInterviewAnswerWithAI } = await jiti.import(
  path.join(REPO_ROOT, "src/lib/interviewGenerator.ts")
);
const { evaluateDiagnosisWithAI } = await jiti.import(
  path.join(REPO_ROOT, "src/lib/packageGenerator.ts")
);

// 1. Routing configuration assertions
assert.equal(GEMINI_CONFIG.SCORING_MODEL, "gemini-3.8-flash", "SCORING_MODEL mismatch");
assert.equal(GEMINI_CONFIG.FREE_MODEL, "gemini-3.8-flash", "FREE_MODEL mismatch");
assert.equal(GEMINI_CONFIG.WRITING_MODEL, "gemini-4-hydrogen", "WRITING_MODEL mismatch");
assert.equal(GEMINI_CONFIG.FALLBACK_MODEL, "gemini-3.8-flash", "FALLBACK_MODEL mismatch");
console.log("[PASS] 1. Hybrid model routing constants verified.");

// 2. Unit regression assertions on 15Q-4 failure sentences
const SRC_15Q_4 =
  "정보시스템 운영 부서에서 4개월간 인턴으로 근무하며 주간 민원 통계 취합 보고를 파이썬 판다스 스크립트로 자동화했습니다. 기존에는 담당자 3명이 매주 금요일 4시간씩 수작업으로 엑셀을 합쳤으나, 자동화 이후 15분 내 산출이 완료되어 보고 누락을 0건으로 줄였습니다.";

const RAW_Q6 =
  "매주 12시간 이상 소요되던 업무를 15분으로 줄이셨는데, 그로 인해 절감된 담당자들의 시간과 리소스는 이후 어떤 업무에 재배치되었나요?";
const RAW_Q10 =
  "4개월간 운영하신 스크립트는 주간 단위 데이터에 맞춰져 있는데, 만약 월간·연간 통계로 확장되거나 민원 데이터가 10배 이상 늘어난다면 성능 저하 없이 처리가 가능한 구조인가요?";

const cleanQ6 = sanitizeInterviewQuestionText(RAW_Q6, SRC_15Q_4);
const cleanQ10 = sanitizeInterviewQuestionText(RAW_Q10, SRC_15Q_4);

assert.deepEqual(findUnverifiedMetrics(cleanQ6, SRC_15Q_4), [], `cleanQ6 leaked unverified metrics: ${cleanQ6}`);
assert.deepEqual(findUnverifiedMetrics(cleanQ10, SRC_15Q_4), [], `cleanQ10 leaked unverified metrics: ${cleanQ10}`);
assert.ok(!cleanQ6.includes("[본인 수치 입력]"), "cleanQ6 must not contain bracket placeholder");
assert.ok(!cleanQ10.includes("[본인 수치 입력]"), "cleanQ10 must not contain bracket placeholder");
assert.ok(cleanQ6.includes("15분"), "cleanQ6 must preserve source-verified 15분");
assert.ok(cleanQ6.includes("상당한 시간"), `cleanQ6 unexpected phrasing: ${cleanQ6}`);
assert.ok(cleanQ10.includes("크게 늘어난다면"), `cleanQ10 unexpected phrasing: ${cleanQ10}`);

// Additional edge cases
const EDGE_CASES = [
  {
    raw: "약 3명의 담당자가 4시간씩 걸리던 일 외에 추가로 50% 이상 비용과 1,000만 원 예산을 절감하고 오류 제로화를 넘어 제로 수준으로 줄이려면?",
    mustContain: ["3명", "4시간", "상당 수준", "상당 금액", "전무한 수준"],
  },
  {
    raw: "요청 데이터가 10배로 늘어나고 민원 200건 이상이 몰리며 담당자 20여 명이 투입되어 [본인 수치 입력] 변동이 생기면 어떻게 대응하시겠습니까?",
    mustContain: ["여러 배로", "여러 건", "여러 명", "상당 수준"],
  },
];

for (const tc of EDGE_CASES) {
  const res = sanitizeInterviewQuestionText(tc.raw, SRC_15Q_4);
  assert.deepEqual(findUnverifiedMetrics(res, SRC_15Q_4), [], `Edge case failed: ${res}`);
  assert.ok(!res.includes("[본인 수치 입력]"), `Edge case kept placeholder: ${res}`);
  for (const sub of tc.mustContain) {
    assert.ok(res.includes(sub), `Expected "${sub}" in "${res}"`);
  }
}

console.log("[PASS] 2. Unit regression on 15Q-4 ('12시간', '10배') & Korean edge cases verified.");
console.log(`  - Q6  cleaned: ${cleanQ6}`);
console.log(`  - Q10 cleaned: ${cleanQ10}`);

// 3. Live API regression if `--live` is passed
if (process.argv.includes("--live")) {
  loadEnvLocal();
  assert.ok(process.env.GEMINI_API_KEY, "GEMINI_API_KEY missing in .env.local for --live test");
  const { GoogleGenerativeAI } = await import(
    pathToFileURL(path.join(REPO_ROOT, "node_modules/@google/generative-ai/dist/index.mjs")).href
  );
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  console.log("[LIVE] Running paid 15Q-4 generation (expect gemini-4-hydrogen)...");
  const paid15 = await generateInterviewQuestionSet({
    genAI,
    jobCategory: "공공기관 디지털·IT",
    resumeText: SRC_15Q_4,
    isFree: false,
  });
  assert.equal(paid15.usedModel, "gemini-4-hydrogen", `Expected 4-hydrogen, got ${paid15.usedModel}`);
  assert.equal(paid15.questions.length, 15, `Expected 15 questions, got ${paid15.questions.length}`);

  for (const q of paid15.questions) {
    const qBad = findUnverifiedMetrics(q.question, SRC_15Q_4);
    const iBad = findUnverifiedMetrics(q.intentSummary, SRC_15Q_4);
    assert.deepEqual(qBad, [], `Live 15Q-4 Q${q.number} unverified metrics: ${qBad} | ${q.question}`);
    assert.deepEqual(iBad, [], `Live 15Q-4 Q${q.number} intent unverified: ${iBad} | ${q.intentSummary}`);
    assert.ok(!q.question.includes("[본인 수치 입력]"), `Live 15Q-4 Q${q.number} contained bracket`);
    assert.ok(!q.intentSummary.includes("[본인 수치 입력]"), `Live 15Q-4 Q${q.number} intent contained bracket`);
  }
  console.log(`[PASS] 3a. Live 15Q-4 passed: model=${paid15.usedModel}, 15/15 clean, ${paid15.durationMs}ms`);

  console.log("[LIVE] Running free 3Q generation (expect gemini-3.8-flash)...");
  const free3 = await generateInterviewQuestionSet({
    genAI,
    jobCategory: "공공기관 디지털·IT",
    resumeText: SRC_15Q_4,
    isFree: true,
  });
  assert.equal(free3.usedModel, "gemini-3.8-flash", `Expected 3.8-flash for free 3Q, got ${free3.usedModel}`);
  assert.equal(free3.questions.length, 3);
  console.log(`[PASS] 3b. Live free 3Q passed: model=${free3.usedModel}, ${free3.durationMs}ms`);

  console.log("[LIVE] Running diagnosis & interview evaluate (expect gemini-3.8-flash)...");
  const diag = await evaluateDiagnosisWithAI({
    genAI,
    text: SRC_15Q_4,
    jobTitle: "공공기관 디지털·IT",
  });
  assert.equal(diag.usedModel, "gemini-3.8-flash", `Expected 3.8-flash for diagnose, got ${diag.usedModel}`);

  const ivEval = await evaluateInterviewAnswerWithAI({
    genAI,
    jobCategory: "공공기관 디지털·IT",
    question: paid15.questions[0],
    currentPromptQuestion: paid15.questions[0].question,
    depth: 1,
    resumeText: SRC_15Q_4,
    userAnswer:
      "정보시스템 운영 인턴 4개월 동안 담당자 3명이 매주 금요일 4시간씩 엑셀로 합치던 민원 통계를 파이썬 판다스 스크립트로 자동화해 15분 내 산출이 완료되고 보고 누락을 0건으로 줄였습니다.",
    priorHistory: [],
    generateNextFollowUp: true,
  });
  assert.equal(ivEval.usedModel, "gemini-3.8-flash", `Expected 3.8-flash for eval, got ${ivEval.usedModel}`);
  console.log(
    `[PASS] 3c. Live scoring endpoints passed: diagnose=${diag.usedModel}(${diag.durationMs}ms), eval=${ivEval.usedModel}(${ivEval.durationMs}ms)`
  );
}
