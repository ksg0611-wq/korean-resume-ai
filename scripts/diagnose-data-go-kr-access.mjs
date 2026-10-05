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
let real = null;
if (!rawEnv) {
  console.log('  [real key] DATA_GO_KR_API_KEY is EMPTY/UNSET in this environment (secret missing or wrong name)');
} else {
  const stripped = rawEnv.trim().replace(/^['"]|['"]$/g, '');
  const cleaned = stripped.replace(/\s+/g, '');
  const pct = /%[0-9A-Fa-f]{2}/.test(cleaned);
  const decoded = pct ? decodeURIComponent(cleaned) : cleaned;
  console.log(`\n=== Real key forms (length=${decoded.length}, percentEncodedInput=${pct}, hadWhitespace=${stripped.length !== cleaned.length}) ===`);
  real = await probe('A normalized (decode once, encode once)', encodeURIComponent(decoded));
  await probe('B old script behaviour (trim, encode once, no decode)', encodeURIComponent(stripped));
}

console.log('\n=== Verdict ===');
if (!garbage.gateway && !nokey.gateway) {
  console.log('  GEO/WAF BLOCK: runner IP is rejected before reaching the API app layer (garbage/no-key requests get no gateway JSON).');
} else if (!rawEnv) {
  console.log('  NOT geo-blocked (gateway answers). Secret DATA_GO_KR_API_KEY is empty/unset.');
} else if (real?.ok) {
  console.log('  NOT geo-blocked and key is VALID with normalized form A. Ingest should succeed.');
} else {
  console.log('  NOT geo-blocked (gateway answers JSON errors). The 403 with the real key is a KEY problem (unregistered/expired/mis-encoded or wrong value in the secret).');
}
