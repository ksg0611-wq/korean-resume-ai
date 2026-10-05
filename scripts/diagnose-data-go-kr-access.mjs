/**
 * Diagnose why apis.data.go.kr returns 403 from a CI runner.
 * Separates: (1) key problem  vs  (2) network-level (WAF / geo-IP) block.
 *
 * Method (differential): send requests with a garbage key and with no key.
 *  - If the gateway answers with its own JSON error (SERVICE_KEY_IS_NOT_REGISTERED_ERROR / SERVICE_KEY_IS_NULL),
 *    the runner IP is NOT blocked -> any 403 with the real key is a key problem.
 *  - If garbage-key requests are also blocked (HTML body, empty body, connection reset/timeout),
 *    the runner IP is blocked at network/WAF level.
 * The key value is never printed.
 */
import fs from 'fs';

if (fs.existsSync('.env.local')) {
  fs.readFileSync('.env.local', 'utf-8').split('\n').forEach(l => {
    const t = l.trim();
    if (t && !t.startsWith('#') && t.includes('=')) {
      const [k, ...v] = t.split('=');
      if (!process.env[k.trim()]) process.env[k.trim()] = v.join('=').trim();
    }
  });
}

const BASE = 'https://apis.data.go.kr/1051000/recruitment/list?resultType=json&ongoingYn=Y&numOfRows=1&pageNo=1&serviceKey=';

async function probe(label, key) {
  const started = Date.now();
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(BASE + key, { signal: ctrl.signal, headers: { 'User-Agent': 'diag/1.0' } });
    clearTimeout(to);
    const text = (await res.text()).replace(/\s+/g, ' ').trim();
    const errMsg = text.match(/"errMsg"\s*:\s*"([^"]+)"/)?.[1];
    let kind;
    if (res.ok && text.includes('"resultCode":200')) kind = 'OK (valid key, API reachable)';
    else if (errMsg) kind = `GATEWAY-JSON (${errMsg}) -> request reached the API app layer`;
    else kind = `NON-GATEWAY BODY -> network/WAF level (${res.headers.get('content-type')}): ${text.slice(0, 120)}`;
    console.log(`  [${label}] HTTP ${res.status} in ${Date.now() - started}ms => ${kind}`);
    return { status: res.status, gateway: Boolean(errMsg) || kind.startsWith('OK'), ok: kind.startsWith('OK') };
  } catch (e) {
    console.log(`  [${label}] NETWORK ERROR in ${Date.now() - started}ms => ${e.name}: ${e.message}${e.cause ? ` [${e.cause.code || e.cause}]` : ''}`);
    return { status: 0, gateway: false, ok: false };
  }
}

console.log('=== Runner egress ===');
try {
  const r = await fetch('https://ipinfo.io/json', { headers: { 'User-Agent': 'diag/1.0' } });
  const j = await r.json();
  console.log(`  ip=${j.ip} country=${j.country} region=${j.region} org=${j.org}`);
} catch (e) {
  console.log(`  (egress lookup failed: ${e.message})`);
}

console.log('\n=== Differential probes against apis.data.go.kr ===');
const garbage = await probe('garbage key', 'INVALIDKEY_DIAG_123');
const nokey = await probe('no key     ', '');

const rawEnv = process.env.DATA_GO_KR_API_KEY;
let probeResults = [];
if (!rawEnv) {
  console.log('  [real key] DATA_GO_KR_API_KEY is EMPTY/UNSET in this environment (secret missing or wrong name)');
} else {
  const stripped = rawEnv.trim().replace(/^['"]|['"]$/g, '');
  const cleaned = stripped.replace(/\s+/g, '');
  const pct = /%[0-9A-Fa-f]{2}/.test(cleaned);
  let decoded = cleaned;
  try { if (pct) decoded = decodeURIComponent(cleaned); } catch {}

  console.log(`\n=== Real key forms (length=${cleaned.length}, percentEncodedInput=${pct}) ===`);
  const r1 = await probe('1. Raw as-is (인코딩 키 원본 그대로, 추가 인코딩 없음)', cleaned);
  const r2 = await probe('2. encodeURIComponent(cleaned) (디코딩 키에 URI 인코딩 적용)', encodeURIComponent(cleaned));
  const r3 = await probe('3. decode once then encodeURIComponent', encodeURIComponent(decoded));
  probeResults = [
    { name: 'Raw as-is (인코딩 키 직결)', ...r1 },
    { name: 'encodeURIComponent (디코딩 키 인코딩)', ...r2 },
    { name: 'decode then encode', ...r3 }
  ];
}

console.log('\n=== Verdict ===');
let verdict = '';
if (!garbage.gateway && !nokey.gateway) {
  verdict = 'GEO/WAF BLOCK: 러너 IP가 게이트웨이 전단에서 차단됨';
} else if (!rawEnv) {
  verdict = 'KEY UNSET: DATA_GO_KR_API_KEY 시크릿이 비어있음';
} else {
  const working = probeResults.find(r => r.ok);
  if (working) {
    verdict = `SUCCESS: [${working.name}] 방식으로 정상 200 OK 수신 확인! (해외 IP 차단 아님)`;
  } else {
    verdict = 'KEY INVALID: 게이트웨이 응답 수신되었으나(해외 IP 차단 아님), 등록된 모든 키 형식에서 미등록 키(403 reasonCode=30) 오류 반환';
  }
}
console.log(`  ${verdict}`);

// GitHub Step Summary 지원
if (process.env.GITHUB_STEP_SUMMARY) {
  const summaryLines = [
    '## 🔍 공공데이터포털 API 연동 진단 결과',
    '',
    `**최종 판정**: ${verdict}`,
    '',
    '| 테스트 항목 | HTTP 상태 | 판정 |',
    '| :--- | :---: | :--- |',
    `| 가비지 키 프로브 | ${garbage.status} | ${garbage.gateway ? '게이트웨이 도달 확인' : '네트워크 차단'} |`,
    `| 키 누락 프로브 | ${nokey.status} | ${nokey.gateway ? '게이트웨이 도달 확인' : '네트워크 차단'} |`
  ];
  probeResults.forEach(r => {
    summaryLines.push(`| ${r.name} | ${r.status} | ${r.ok ? '✅ 200 성공' : '❌ 실패'} |`);
  });
  try {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryLines.join('\n') + '\n');
  } catch {}
}
