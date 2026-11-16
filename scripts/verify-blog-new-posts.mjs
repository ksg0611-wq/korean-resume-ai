/**
 * 블로그 신규 3편 검증: 원문 일치(문장 단위), 렌더링(h2/표/인용문/내부 링크), SEO/JSON-LD
 * 사용: node scripts/verify-blog-new-posts.mjs [BASE_URL]  (미지정 시 로컬 next start 3097 기동)
 */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const SRC = process.env.BLOG_SRC_MD;
assert.ok(SRC && fs.existsSync(SRC), "BLOG_SRC_MD env must point to the source markdown");

const require = createRequire(import.meta.url);
const jitiModule = require(path.resolve(process.cwd(), "node_modules/jiti"));
const createJiti = jitiModule.createJiti || (typeof jitiModule === "function" ? jitiModule : jitiModule.default);
const jiti = createJiti(import.meta.url, { alias: { "@": path.resolve(process.cwd(), "src") } });
const { blogPosts } = await jiti.import(path.resolve(process.cwd(), "src/lib/blogData.ts"));
const { extractFaq } = await jiti.import(path.resolve(process.cwd(), "src/lib/blogMarkdown.ts"));

const SLUGS = [
  "blind-hiring-cover-letter-banned-expressions",
  "ncs-cover-letter-question-types",
  "public-institution-personality-interview",
];

// ── 1. 원문 일치 (데이터 레벨) ──
const md = fs.readFileSync(SRC, "utf8").replace(/\r\n/g, "\n");
const sections = md.split(/^## 글 \d\. .*$/m).slice(1);
assert.equal(sections.length, 3);
const expected = sections.map((sec) => {
  const lines = sec.replace(/^\n+/, "").split("\n");
  const desc = lines.shift().replace("**description:** ", "").trim();
  return { desc, body: lines.join("\n").trim() };
});

assert.equal(blogPosts.length, 18, "should be 15 + 3 posts");
SLUGS.forEach((slug, i) => {
  const post = blogPosts.find((p) => p.slug === slug);
  assert.ok(post, `post ${slug} exists`);
  assert.equal(post.content, expected[i].body, `${slug}: content must equal source verbatim`);
  assert.equal(post.excerpt, expected[i].desc, `${slug}: description must equal source`);
  assert.equal(post.date, "2026-11-16");
  const faq = extractFaq(post.content);
  assert.equal(faq.length, 3, `${slug}: 3 FAQ items`);
  for (const text of [post.title, post.excerpt, post.ctaLabel]) {
    assert.ok(!/합격/.test(text), `${slug}: no 합격 in title/description/CTA`);
  }
});
assert.equal(blogPosts.find((p) => p.slug === SLUGS[0]).ctaLabel, "내 자소서에 블라인드 위반 표현이 있는지 무료 진단으로 확인하기");
assert.equal(blogPosts.find((p) => p.slug === SLUGS[1]).ctaLabel, "문항에 맞춘 자소서 초안 만들어 보기");
assert.equal(blogPosts.find((p) => p.slug === SLUGS[2]).ctaLabel, "내 답변을 채점받고 꼬리질문까지 연습하기");
assert.equal(blogPosts.find((p) => p.slug === SLUGS[2]).ctaTarget, "/interview");
assert.equal(blogPosts.find((p) => p.slug === SLUGS[0]).ctaTarget, "/");
assert.equal(blogPosts.find((p) => p.slug === SLUGS[1]).ctaTarget, "/");
// 기존 15편 CTA 기본 동작 유지
for (const p of blogPosts.slice(0, 15)) assert.equal(p.ctaLabel, undefined);
assert.ok(blogPosts.find((p) => p.slug === "interview-conflict-resolution-star"), "conflict slug exists");
assert.ok(blogPosts.find((p) => p.slug === "interview-probing-question-tips"), "probing slug exists");
console.log("PASS 1: data verbatim match (content/description), 15+3 posts, CTA labels/targets, FAQ=3 each, no 합격 in title/desc/CTA");

// ── 2. 렌더링 / SEO (HTTP) ──
let base = process.argv[2];
let proc = null;
if (!base) {
  const port = 3097;
  base = `http://127.0.0.1:${port}`;
  proc = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) {
    try { ok = (await fetch(`${base}/blog`)).ok; } catch {}
    if (!ok) await new Promise((r) => setTimeout(r, 250));
  }
  assert.ok(ok, "next start ready");
}

const decode = (s) =>
  s.replace(/<!-- -->/g, "").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const textOf = (html) => decode(html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<\/?(strong|a|span|em)(\s[^>]*)?>/g, "").replace(/<[^>]+>/g, "\n"));
const norm = (s) => s.replace(/\s+/g, " ").trim();
const strip = (s) => s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\\([~*_`>#\-\\])/g, "$1");

try {
  for (let i = 0; i < SLUGS.length; i++) {
    const slug = SLUGS[i];
    const res = await fetch(`${base}/blog/${slug}`);
    assert.equal(res.status, 200, `${slug} HTTP 200`);
    const html = await res.text();
    const title = blogPosts.find((p) => p.slug === slug).title;

    assert.ok(html.includes(`<link rel="canonical" href="https://korea-resume.com/blog/${slug}"/>`), `${slug} canonical`);
    assert.ok(html.includes(`<title>${title} | Korea Resume AI</title>`) || decode(html).includes(`<title>${title} | Korea Resume AI</title>`), `${slug} unique title`);
    assert.ok(html.includes(`name="description" content="${expected[i].desc}"`), `${slug} meta description`);

    const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    const article = ld.find((x) => x["@type"] === "Article");
    const faq = ld.find((x) => x["@type"] === "FAQPage");
    assert.ok(article, `${slug} Article JSON-LD`);
    assert.equal(article.mainEntityOfPage["@id"], `https://korea-resume.com/blog/${slug}`);
    assert.equal(article.datePublished, "2026-11-16");
    assert.ok(faq && faq.mainEntity.length === 3, `${slug} FAQPage JSON-LD with 3 Q&A`);

    // h2 소제목 구조
    const h2s = [...html.matchAll(/<h2[^>]*>/g)].length;
    assert.ok(h2s >= 5, `${slug} has h2 headings (${h2s})`);

    // 원문 문장 보존: 본문의 모든 줄(마크다운 기호 제거 후)이 렌더링 텍스트에 존재
    const rendered = norm(textOf(html));
    const bodyLines = expected[i].body.split("\n").map((l) => l.trim()).filter(Boolean);
    let checked = 0;
    for (const raw of bodyLines) {
      if (/^\|[\s:|-]+\|$/.test(raw)) continue; // 표 구분선
      let line = raw;
      if (line.startsWith("|")) {
        const cells = line.replace(/^\||\|$/g, "").split("|").map((c) => strip(c.trim()));
        for (const c of cells) { assert.ok(rendered.includes(norm(c)), `${slug} table cell missing: ${c}`); checked++; }
        continue;
      }
      line = line.replace(/^#{2,4} /, "").replace(/^> ?/, "").replace(/^- /, "").replace(/^\d+\. /, "");
      line = norm(strip(line));
      assert.ok(rendered.includes(line), `${slug} sentence missing/changed: ${line.slice(0, 60)}`);
      checked++;
    }
    console.log(`  ${slug}: 200, canonical OK, Article+FAQPage(3) OK, h2=${h2s}, source lines verified=${checked}`);

    if (slug === SLUGS[1]) {
      assert.ok(/<table/.test(html) && /<th[^>]*>[^<]*경험의 성격/.test(html), "post2 table rendered");
      assert.equal([...html.matchAll(/<tr>/g)].length, 6, "post2 table: header + 5 rows");
      assert.ok(html.includes('href="/blog/interview-conflict-resolution-star"'), "post2 → conflict STAR link");
    }
    if (slug === SLUGS[2]) {
      assert.ok(/<blockquote[^>]*>[^<]*규정을 지키는 것을 원칙으로 하겠습니다/.test(html), "post3 blockquote rendered");
      assert.ok(html.includes('href="/blog/interview-probing-question-tips"'), "post3 → probing link");
      assert.ok(html.includes('href="/interview"'), "post3 CTA /interview");
    }
    assert.ok(html.includes(blogPosts.find((p) => p.slug === slug).ctaLabel), `${slug} CTA label`);
    assert.ok(html.includes(blogPosts.find((p) => p.slug === slug).ctaDescription), `${slug} CTA description`);
    for (const banned of ["이론은 끝났습니다", "완벽한 구조", "1분 만에", "알아서 작성"]) {
      assert.ok(!html.includes(banned), `${slug} must not contain legacy CTA phrase: ${banned}`);
    }
  }

  // STAR 글 하단 링크
  const star = await (await fetch(`${base}/blog/star-method-resume`)).text();
  assert.ok(star.includes('href="/blog/ncs-cover-letter-question-types"'), "STAR post links to new post 2");
  // 기존 글에는 JSON-LD 미적용(기존 동작 유지), 기본 CTA 유지
  assert.ok(!star.includes("application/ld+json"), "legacy posts unchanged (no JSON-LD)");
  assert.ok(star.includes("👉 AI 자소서 무료로 생성해보기"), "legacy default CTA kept");

  // /blog 목록 상단 노출 (날짜 내림차순, 신규 3편이 최상단)
  const list = await (await fetch(`${base}/blog`)).text();
  const order = [...list.matchAll(/href="\/blog\/([a-z0-9-]+)"/g)].map((m) => m[1]);
  assert.deepEqual(order.slice(0, 3), SLUGS, "new 3 posts on top of /blog");

  // sitemap (DB 미연결 환경에서도 blog URL은 포함)
  const sm = await (await fetch(`${base}/sitemap.xml`)).text();
  for (const slug of SLUGS) {
    const m = sm.match(new RegExp(`<loc>https://korea-resume.com/blog/${slug}</loc>\\s*<lastmod>([^<]+)</lastmod>`));
    assert.ok(m, `sitemap contains ${slug}`);
    assert.ok(m[1].startsWith("2026-11-16"), `sitemap lastmod ${m[1]}`);
  }
  console.log("PASS 2: HTTP 200, canonical, title/description, Article+FAQPage JSON-LD, h2/table/blockquote/internal links, verbatim sentences, /blog top order, sitemap lastmod");
} finally {
  if (proc) proc.kill();
}
