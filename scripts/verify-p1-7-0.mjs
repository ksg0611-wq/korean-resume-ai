/**
 * P1.7-0 Verification Suite
 * Tests:
 * 1. WaitlistModal removed from /jobs/[sn]/JobDetailAction.tsx and link navigates to /?sn={sn}
 * 2. /jobs/[sn]/page.tsx includes NewJobAlertForm at bottom & /privacy reflects new job alert purpose
 * 3. Invalid/non-positive sn falls back safely without throwing (`resolveVerifiedJobContext`, `buildHomeJobContextSummary`)
 * 4. `formatJobContextPromptBlock` includes DB-verified qualification, preference, and NCS names cleanly
 * 5. Preview record (`savePreviewRecord`) persists `jobSn` for downstream paid unlock & regeneration context
 */

import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import http from "node:http";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const jitiModule = require(path.resolve(process.cwd(), "node_modules/jiti"));
const createJiti =
  jitiModule.createJiti || (typeof jitiModule === "function" ? jitiModule : jitiModule.default);

const kv = new Map();
function encodeUpstashResult(val, useBase64) {
  if (!useBase64 || val === null || val === undefined) return val;
  if (typeof val === "string") return val === "OK" ? "OK" : Buffer.from(val, "utf8").toString("base64");
  if (Array.isArray(val)) return val.map((x) => encodeUpstashResult(x, true));
  return val;
}
const upstashServer = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    res.setHeader("Content-Type", "application/json");
    const useBase64 = String(req.headers["upstash-encoding"] || "").toLowerCase() === "base64";
    const parsed = body ? JSON.parse(body) : [];
    const exec = (cmdArr) => {
      const cmd = String(cmdArr[0]).toUpperCase();
      const args = cmdArr.slice(1);
      if (cmd === "GET") return kv.get(String(args[0])) ?? null;
      if (cmd === "SET") {
        kv.set(String(args[0]), args[1]);
        return "OK";
      }
      if (cmd === "DEL") {
        let n = 0;
        for (const k of args) if (kv.delete(String(k))) n++;
        return n;
      }
      return null;
    };
    if (req.url === "/pipeline") {
      res.end(JSON.stringify(parsed.map((c) => ({ result: encodeUpstashResult(exec(c), useBase64) }))));
      return;
    }
    res.end(JSON.stringify({ result: encodeUpstashResult(exec(parsed), useBase64) }));
  });
});

await new Promise((r) => upstashServer.listen(0, "127.0.0.1", r));
process.env.UPSTASH_REDIS_REST_URL = `http://127.0.0.1:${upstashServer.address().port}`;
process.env.UPSTASH_REDIS_REST_TOKEN = "mock_token";

const jiti = createJiti(import.meta.url, {
  alias: { "@": path.resolve(process.cwd(), "src") },
});

try {
  // 1. UI & file checks
  const actionSrc = fs.readFileSync(path.resolve(process.cwd(), "src/app/jobs/[sn]/JobDetailAction.tsx"), "utf8");
  assert.ok(!actionSrc.includes("WaitlistModal"), "WaitlistModal must be removed from JobDetailAction");
  assert.ok(actionSrc.includes("/?sn="), "AI 자소서 작성하기 must route directly to /?sn=...");
  assert.ok(actionSrc.includes("AI 자소서 작성하기"), "Button label must exist");
  assert.equal(
    fs.existsSync(path.resolve(process.cwd(), "src/app/jobs/[sn]/WaitlistModal.tsx")),
    false,
    "WaitlistModal.tsx must be deleted"
  );

  const detailSrc = fs.readFileSync(path.resolve(process.cwd(), "src/app/jobs/[sn]/page.tsx"), "utf8");
  assert.ok(detailSrc.includes("NewJobAlertForm"), "Job detail page must include NewJobAlertForm");

  const privacySrc = fs.readFileSync(path.resolve(process.cwd(), "src/app/privacy/page.tsx"), "utf8");
  assert.ok(privacySrc.includes("새 공고 알림"), "Privacy page must be updated to new job alert purpose");
  assert.ok(privacySrc.includes("기존 사전신청"), "Privacy page must document prior waitlist handling");
  console.log("PASS 1: WaitlistModal removed, /?sn= direct CTA wired, NewJobAlertForm & /privacy updated");

  // 2. JobContext helpers & fallback
  const jobContextMod = await jiti.import(path.resolve(process.cwd(), "src/lib/jobContext.ts"));
  assert.equal(jobContextMod.parseJobSn("306807"), 306807);
  assert.equal(jobContextMod.parseJobSn(306807), 306807);
  assert.equal(jobContextMod.parseJobSn("abc"), null);
  assert.equal(jobContextMod.parseJobSn("-5"), null);
  assert.equal(jobContextMod.parseJobSn(""), null);

  assert.equal(await jobContextMod.resolveVerifiedJobContext("invalid_sn"), null);

  const summary = jobContextMod.buildHomeJobContextSummary({
    sn: 306807,
    inst_name: "테스트공사",
    title: "2026년 신입직원 채용(행정직)",
    ncs_names: ["경영·회계·사무"],
    end_date: "2099-12-31",
    recruit_type_name: "신입",
    qualification: "학력 및 연령 제한 없음",
    preference: "보훈대상자 및 장애인 우대",
    preference_cond: "한국사능력검정시험 1급 우대",
  });
  assert.equal(summary.sn, 306807);
  assert.equal(summary.instName, "테스트공사");
  assert.equal(summary.hasQualification, true);
  assert.equal(summary.hasPreference, true);
  assert.ok(summary.dDayLabel.startsWith("D-"));

  const promptBlock = jobContextMod.formatJobContextPromptBlock(
    {
      sn: 306807,
      instName: "테스트공사",
      title: "2026년 신입직원 채용(행정직)",
      ncsNames: ["경영·회계·사무"],
      recruitTypeName: "신입",
      qualification: "TOEIC 700점 이상",
      preference: "컴퓨터활용능력 1급 우대",
      preferenceCond: null,
      procedureInfo: null,
    },
    "diagnose"
  );
  assert.ok(promptBlock.includes("sn=306807"));
  assert.ok(promptBlock.includes("TOEIC 700점 이상"));
  assert.ok(promptBlock.includes("컴퓨터활용능력 1급 우대"));
  assert.ok(promptBlock.includes("경영·회계·사무"));
  console.log("PASS 2: jobContext parsing, fallback, Home summary, and prompt injection verified");

  // 3. Preview record persists jobSn
  const ordersMod = await jiti.import(path.resolve(process.cwd(), "src/lib/orders.ts"));
  const savedPreview = await ordersMod.savePreviewRecord({
    jobTitle: "[테스트공사] 2026년 신입직원 채용(행정직)",
    jobSn: 306807,
    memo: "테스트 메모입니다.",
    items: [],
    usedModel: "gemini-4-hydrogen",
    thinkingLevel: "medium",
  });
  assert.equal(savedPreview.jobSn, 306807);
  const rawStored = JSON.parse(String(kv.get(`preview:${savedPreview.previewToken}`)));
  assert.equal(rawStored.jobSn, 306807);
  console.log("PASS 3: preview:{token} persists jobSn for downstream unlock/regeneration");

  console.log("\nALL P1.7-0 CHECKS PASSED.");
} finally {
  upstashServer.closeAllConnections?.();
  upstashServer.close();
  http.globalAgent.destroy();
}
process.exit(0);
