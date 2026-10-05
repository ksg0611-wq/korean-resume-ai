import fs from 'fs';
import crypto from 'crypto';
import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';

// ==============================================================================
// 0. Environment Setup
// ==============================================================================
if (fs.existsSync('.env.local')) {
  const envContent = fs.readFileSync('.env.local', 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [k, ...v] = trimmed.split('=');
      const key = k.trim();
      if (!process.env[key]) {
        process.env[key] = v.join('=').trim();
      }
    }
  });
}

// ==============================================================================
// 1. DB Client with Supabase Remote Priority + PGlite Fallback
// ==============================================================================
export class IngestDBClient {
  constructor() {
    this.mode = null; // 'REMOTE' | 'LOCAL-PGLITE'
    this.client = null;
    this.pgPool = null;
    this.pgliteInstance = null;
  }

  async init() {
    const isProd = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL) || Boolean(process.env.CRON);
    // Deduplicate URLs and prioritize working remote connection
    const rawUrls = [
      process.env.DATABASE_URL,
      process.env.DIRECT_URL,
      process.env.SUPABASE_DB_URL
    ].filter(Boolean);
    const remoteUrls = Array.from(new Set(rawUrls));

    let connected = false;
    let lastError = null;

    for (const url of remoteUrls) {
      const maskedUrl = url.replace(/:([^:@]+)@/, ':****@');
      console.log(`[DB] Attempting remote Supabase connection: ${maskedUrl}`);
      try {
        const testClient = new pg.Client({
          connectionString: url,
          ssl: url.includes('localhost') ? false : { rejectUnauthorized: false },
          connectionTimeoutMillis: 5000
        });
        await testClient.connect();
        const res = await testClient.query('SELECT NOW() as now, version() as ver;');
        console.log(`[DB] [REMOTE] Connected to Supabase successfully! Server time: ${res.rows[0].now}`);
        this.client = testClient;
        this.mode = 'REMOTE';
        connected = true;
        break;
      } catch (err) {
        lastError = err;
        const maskedErr = String(err.message).replace(/postgresql:\/\/([^:]+):([^@]+)@/g, 'postgresql://$1:****@').replace(/:([^:@]{3,})@/g, ':****@');
        console.warn(`[DB] [REMOTE] Connection failed (${maskedErr}). Trying next or fallback...`);
      }
    }

    if (!connected) {
      if (isProd) {
        const safeErr = lastError ? String(lastError.message).replace(/postgresql:\/\/([^:]+):([^@]+)@/g, 'postgresql://$1:****@').replace(/:([^:@]{3,})@/g, ':****@') : 'No remote database URL configured';
        throw new Error(`[DB] [Fail-Fast] In production / Vercel / Cron environment, remote DB connection is mandatory. PGlite fallback is strictly forbidden. (${safeErr})`);
      }
      console.warn(`[DB] [LOCAL-PGLITE] Remote Supabase connection failed or not configured.`);
      console.log(`[DB] [LOCAL-PGLITE] Initializing local PGlite (PostgreSQL WASM engine) at ./data/postgres_fresh ...`);
      fs.mkdirSync('./data/postgres_fresh', { recursive: true });
      this.pgliteInstance = new PGlite('./data/postgres_fresh');
      await this.pgliteInstance.waitReady;
      this.client = this.pgliteInstance;
      this.mode = 'LOCAL-PGLITE';
      console.log(`[DB] [LOCAL-PGLITE] Local PostgreSQL engine ready.`);
    }

    return this.mode;
  }

  async query(sql, params = []) {
    return await this.client.query(sql, params);
  }

  async exec(sql) {
    if (this.mode === 'REMOTE') {
      return await this.client.query(sql);
    } else {
      return await this.client.exec(sql);
    }
  }

  async close() {
    if (this.mode === 'REMOTE' && this.client) {
      await this.client.end();
    }
  }
}

// ==============================================================================
// 2. Normalization & Parsing Logic
// ==============================================================================
const REGION_NORM_MAP = {
  '경상북도': '경북', '경북': '경북',
  '전북특별자치도': '전북', '전라북도': '전북', '전북': '전북',
  '강원특별자치도': '강원', '강원도': '강원', '강원': '강원',
  '제주특별자치도': '제주', '제주도': '제주', '제주': '제주',
  '대구광역시': '대구', '대구': '대구',
  '부산광역시': '부산', '부산': '부산',
  '울산광역시': '울산', '울산': '울산',
  '광주광역시': '광주', '광주': '광주',
  '전라남도': '전남', '전남': '전남',
  '충청북도': '충북', '충북': '충북',
  '충청남도': '충남', '충남': '충남',
  '경상남도': '경남', '경남': '경남',
  '세종특별자치시': '세종', '세종': '세종',
  '대전광역시': '대전', '대전': '대전',
  '대구·경북': '대구·경북', '대구, 경북': '대구·경북',
  '경남, 울산': '경남·울산', '경남·울산': '경남·울산',
  '광주·전남': '광주·전남', '광주, 전남': '광주·전남',
  '충청권': '충청권'
};

function formatDate(str) {
  if (!str) return null;
  const s = String(str).trim();
  if (s.length === 8) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  return s;
}

function computeContentHash(it) {
  const payload = [
    it.recrutPblntSn,
    it.recrutPbancTtl || '',
    it.pbancBgngYmd || '',
    it.pbancEndYmd || '',
    it.aplyQlfcCn || '',
    it.prefCn || '',
    it.prefCondCn || ''
  ].join('|');
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function parsePosting(it) {
  const prefText = `${it.prefCn || ''} ${it.prefCondCn || ''}`;
  const is_nonmetro_talent = prefText.includes('비수도권 지역인재') || 
                             prefText.includes('비수도권지역인재') || 
                             prefText.includes('비수도권(지방)인재') || 
                             prefText.includes('비수도권 인재');

  const regex = /이전지역\s*\(\s*([^)]+?)\s*\)/g;
  let match;
  let relocation_region = null;
  let needs_review = false;

  const matches = [];
  while ((match = regex.exec(prefText)) !== null) {
    matches.push(match[1].trim());
  }

  if (matches.length > 0) {
    const raw = matches[0].replace(/인재|채용목표제|대상자/g, '').trim();
    if (REGION_NORM_MAP[raw]) {
      relocation_region = REGION_NORM_MAP[raw];
    } else {
      let matched = null;
      for (const [k, v] of Object.entries(REGION_NORM_MAP)) {
        if (raw === k) {
          matched = v;
          break;
        }
      }
      if (matched) {
        relocation_region = matched;
      } else {
        relocation_region = raw;
        needs_review = true;
      }
    }
  } else {
    if (prefText.includes('지역인재')) {
      needs_review = true;
    }
  }

  const work_region_codes = (it.workRgnLst || '').split(',').map(s => s.trim()).filter(Boolean);
  const work_region_names = (it.workRgnNmLst || '').split(',').map(s => s.trim()).filter(Boolean);
  const work_region_count = work_region_codes.length;
  const is_gyeongbuk_primary = (work_region_count === 1 && work_region_codes.includes('R3021'));
  const is_regional_talent = (relocation_region !== null || is_nonmetro_talent);

  const hire_type_codes = (it.hireTypeLst || '').split(',').map(s => s.trim()).filter(Boolean);
  const hire_type_names = (it.hireTypeNmLst || '').split(',').map(s => s.trim()).filter(Boolean);
  const ncs_codes = (it.ncsCdLst || '').split(',').map(s => s.trim()).filter(Boolean);
  const ncs_names = (it.ncsCdNmLst || '').split(',').map(s => s.trim()).filter(Boolean);

  const startDate = formatDate(it.pbancBgngYmd);
  const endDate = formatDate(it.pbancEndYmd);

  const attachments = Array.isArray(it.files) ? it.files.map((f, i) => ({
    sortNo: f.sortNo || i + 1,
    type: f.type || 'A',
    fileNm: f.fileNm || f.name || '첨부파일',
    fileUrl: f.fileUrl || f.url || ''
  })) : [];

  const steps = Array.isArray(it.steps) ? it.steps : [];

  return {
    sn: parseInt(it.recrutPblntSn, 10),
    inst_cd: it.pblntInstCd || 'UNKNOWN',
    inst_std_cd: it.pbadmsStdInstCd || null,
    inst_name: it.instNm || '알수없음',
    title: (it.recrutPbancTtl || '').trim(),
    status: 'open',
    content_hash: computeContentHash(it),
    start_date: startDate,
    end_date: endDate,
    recruit_count: it.recrutNope ? parseInt(it.recrutNope, 10) : null,
    recruit_type_code: it.recrutSe || null,
    recruit_type_name: it.recrutSeNm || null,
    hire_type_codes,
    hire_type_names,
    work_region_codes,
    work_region_names,
    work_region_count,
    is_gyeongbuk_primary,
    relocation_region,
    is_nonmetro_talent,
    is_regional_talent,
    needs_review,
    ncs_codes,
    ncs_names,
    education_code: it.acbgCondLst || null,
    education_name: it.acbgCondNmLst || null,
    qualification: it.aplyQlfcCn || null,
    disqualification: it.disqlfcRsn || null,
    preference: it.prefCn || null,
    preference_cond: it.prefCondCn || null,
    procedure_info: it.scrnprcdrMthdExpln || null,
    replacement_yn: it.replmprYn || 'N',
    src_url: it.srcUrl || null,
    has_app_form: attachments.some(a => a.type === 'B'),
    has_job_desc: attachments.some(a => a.type === 'C'),
    attachments,
    steps,
    raw_payload: it
  };
}

// ==============================================================================
// 3. Live API Fetching (apis.data.go.kr Government Gateway)
// ==============================================================================
/**
 * 공공데이터포털(apis.data.go.kr) 서비스키 파라미터 자동 확정 함수
 *
 * 공공데이터포털 키 특성:
 * 1) 일반 인증키 (Encoding): 이미 %2B, %2F, %3D 등으로 인코딩된 상태 -> URL 쿼리에 추가 인코딩 없이 그대로(?serviceKey=...) 전달해야 함.
 * 2) 일반 인증키 (Decoding): +, /, == 등 원본 특수문자 상태 -> URL 쿼리 전송 시 반드시 encodeURIComponent()로 인코딩해야 함.
 *
 * GitHub Secrets에 어떤 키(Encoding/Decoding)를 등록했든, 개행/따옴표가 섞였든 상관없이
 * 1건 경량 프로브 호출을 통해 200 OK가 검증된 최적의 쿼리 파라미터 문자열을 자동 확정합니다.
 */
async function resolveWorkingServiceKeyQueryParam() {
  const rawKey = process.env.DATA_GO_KR_API_KEY;
  if (!rawKey) {
    throw new Error('[API Key Error] DATA_GO_KR_API_KEY not found in process.env or .env.local');
  }

  // 1. 공백, 개행, 따옴표 엄격 제거
  const cleanKey = rawKey.trim().replace(/^['"]|['"]$/g, '').replace(/\s+/g, '');
  const hasPercent = /%[0-9A-Fa-f]{2}/.test(cleanKey);

  console.log(`[API Key Check] Raw length: ${rawKey.length}, Cleaned length: ${cleanKey.length}, Has percent encoding (%XX): ${hasPercent}`);

  // 2. 후보군 구성
  const candidates = [];
  if (hasPercent) {
    // 사용자가 'Encoding 키'를 등록한 경우: 원본 그대로 전송이 1순위 (추가 인코딩 금지)
    candidates.push({ label: 'Encoding Key (Raw as-is, no double encoding)', param: cleanKey });
    try {
      candidates.push({ label: 'Decoded then Encoded', param: encodeURIComponent(decodeURIComponent(cleanKey)) });
    } catch {}
  } else {
    // 사용자가 'Decoding 키'를 등록한 경우: encodeURIComponent 적용이 1순위
    candidates.push({ label: 'Decoding Key (with encodeURIComponent)', param: encodeURIComponent(cleanKey) });
    candidates.push({ label: 'Decoding Key (Raw as-is)', param: cleanKey });
  }

  const probeBase = 'https://apis.data.go.kr/1051000/recruitment/list?resultType=json&ongoingYn=Y&numOfRows=1&pageNo=1';
  let lastFailureDetail = '';

  for (const c of candidates) {
    try {
      const probeUrl = `${probeBase}&serviceKey=${c.param}`;
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch(probeUrl, { signal: ctrl.signal });
      clearTimeout(tid);

      const text = await res.text();
      if (res.ok && text.includes('"resultCode":200')) {
        console.log(`[API Key Verified] Successfully authenticated via [${c.label}]!`);
        return c.param;
      } else {
        const errMsg = text.match(/"errMsg"\s*:\s*"([^"]+)"/)?.[1] || '';
        const reason = text.match(/"returnReasonCode"\s*:\s*"([^"]+)"/)?.[1] || '';
        lastFailureDetail = `HTTP ${res.status}: errMsg=${errMsg}, reasonCode=${reason}`;
        console.warn(`[API Key Probe] Candidate [${c.label}] failed (${lastFailureDetail}). Trying next...`);
      }
    } catch (err) {
      lastFailureDetail = `${err.message}`;
      console.warn(`[API Key Probe] Candidate [${c.label}] network error (${lastFailureDetail}). Trying next...`);
    }
  }

  throw new Error(`[API Key Error] All serviceKey format candidates failed against apis.data.go.kr. Last error: ${lastFailureDetail}. Please verify that DATA_GO_KR_API_KEY in GitHub Secrets is an active, approved key.`);
}

async function fetchWithRetry(url, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let nonRetryable = false;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) {
        let detail = '';
        try {
          const bodyText = (await res.text()).replace(/\s+/g, ' ').trim();
          const errMsg = bodyText.match(/"errMsg"\s*:\s*"([^"]+)"/)?.[1];
          const reason = bodyText.match(/"returnReasonCode"\s*:\s*"([^"]+)"/)?.[1];
          detail = errMsg
            ? ` | gateway errMsg=${errMsg}${reason ? ` reasonCode=${reason}` : ''}`
            : ` | non-gateway body[${res.headers.get('content-type') || 'n/a'}]: ${bodyText.slice(0, 200)}`;
        } catch { /* ignore body read errors */ }
        if (res.status === 401 || res.status === 403) nonRetryable = true;
        throw new Error(`HTTP ${res.status}: ${res.statusText}${detail}`);
      }
      return await res.json();
    } catch (err) {
      const isLast = attempt === maxRetries || nonRetryable;
      const causeStr = err.cause ? ` [Cause: ${err.cause.code || err.cause}]` : '';
      console.warn(`[Live API] Page fetch attempt ${attempt}/${maxRetries} failed: ${err.message}${causeStr}`);
      if (isLast) {
        throw new Error(`[Live API Gateway Error] Failed after ${attempt} attempt(s) to reach apis.data.go.kr. Last error: ${err.message}${causeStr}`);
      }
      console.log(`[Live API] Retrying in ${2 * attempt}s...`);
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
}

export async function fetchLiveOngoingJobs() {
  const serviceKeyParam = await resolveWorkingServiceKeyQueryParam();
  const allItems = [];
  let page = 1;
  let listCalls = 0;
  let hasMore = true;

  console.log(`\n[Live API Gateway] Calling https://apis.data.go.kr/1051000/recruitment/list ...`);

  while (hasMore) {
    listCalls++;
    const url = `https://apis.data.go.kr/1051000/recruitment/list?resultType=json&ongoingYn=Y&numOfRows=100&pageNo=${page}&serviceKey=${serviceKeyParam}`;
    
    console.log(`[Live API] Fetching page ${page} (call #${listCalls})...`);
    const data = await fetchWithRetry(url, 3);
    const items = data.result || [];
    const totalCount = data.totalCount || null;

    allItems.push(...items);
    console.log(`[Live API] Page ${page}: fetched ${items.length} items (accumulated: ${allItems.length}${totalCount ? ` / total: ${totalCount}` : ''})`);

    if (items.length < 100 || (totalCount && allItems.length >= totalCount) || page >= 20) {
      hasMore = false;
    } else {
      page++;
      await new Promise(r => setTimeout(r, 200)); // Respect API gateway rate limit
    }
  }

  console.log(`[Live API] Completed live fetch: total ${allItems.length} ongoing job postings via ${listCalls} API calls.`);
  return { items: allItems, listCalls };
}

// ==============================================================================
// 4. Ingest Runner Function (Supports LIVE API & SNAPSHOT Modes)
// ==============================================================================
export async function runIngest(options = {}) {
  const isLiveFlag = process.argv.includes('--live') || options.mode === 'live' || process.env.INGEST_MODE === 'live' || process.env.CRON === 'true';
  const mode = isLiveFlag ? 'LIVE' : 'SNAPSHOT';
  const snapshotPath = options.snapshotPath || 'data/raw_snapshot_20260906.json';

  console.log(`\n===============================================================`);
  console.log(`=== Korea Resume AI Ingestion Pipeline (Single Entrypoint) ===`);
  console.log(`===============================================================`);
  console.log(`[DATA SOURCE CLARIFICATION]`);
  if (mode === 'LIVE') {
    console.log(`★ ACTIVE MODE: [LIVE API]`);
    console.log(`  Target: apis.data.go.kr (정부 공공데이터포털 채용정보 실시간 호출)`);
    console.log(`  Endpoint: /1051000/recruitment/list?ongoingYn=Y`);
    console.log(`  Proof: No local snapshot files (data/*.json) will be read.`);
  } else {
    console.log(`★ ACTIVE MODE: [SNAPSHOT REPLAY]`);
    console.log(`  Target: Local frozen snapshot file (${snapshotPath})`);
    console.log(`  Notice: To run live government API ingestion, pass '--live' or set INGEST_MODE=live`);
  }
  console.log(`===============================================================\n`);

  let items = [];
  let listCalls = 0;

  if (mode === 'LIVE') {
    const liveRes = await fetchLiveOngoingJobs();
    items = liveRes.items;
    listCalls = liveRes.listCalls;
  } else {
    if (!fs.existsSync(snapshotPath)) {
      throw new Error(`Snapshot file not found at ${snapshotPath}`);
    }
    const snapshotRaw = fs.readFileSync(snapshotPath);
    const snapshotHash = crypto.createHash('sha256').update(snapshotRaw).digest('hex');
    items = JSON.parse(snapshotRaw.toString('utf-8'));
    listCalls = 6;
    console.log(`[Snapshot] File: ${snapshotPath}`);
    console.log(`[Snapshot] Size: ${snapshotRaw.length} bytes`);
    console.log(`[Snapshot] SHA-256: ${snapshotHash}`);
    console.log(`[Snapshot] Items: ${items.length}건`);
  }

  // Init DB
  const db = new IngestDBClient();
  const dbMode = await db.init();

  // Apply DDL
  console.log(`\n[DDL] Applying src/lib/db/schema-v2.sql ...`);
  const ddl = fs.readFileSync('src/lib/db/schema-v2.sql', 'utf-8');
  await db.exec(ddl);
  console.log(`[DDL] Applied schema-v2.sql successfully on [${dbMode}].`);

  // Upsert institutions
  console.log(`\n[Ingest] Upserting institutions...`);
  const instMap = new Map();
  items.forEach(it => {
    const cd = it.pblntInstCd || 'UNKNOWN';
    if (!instMap.has(cd)) {
      instMap.set(cd, {
        inst_cd: cd,
        inst_std_cd: it.pbadmsStdInstCd || null,
        inst_name: it.instNm || '알수없음'
      });
    }
  });

  for (const inst of instMap.values()) {
    await db.query(`
      INSERT INTO institutions (inst_cd, inst_std_cd, inst_name)
      VALUES ($1, $2, $3)
      ON CONFLICT (inst_cd) DO UPDATE SET
        inst_std_cd = COALESCE(EXCLUDED.inst_std_cd, institutions.inst_std_cd),
        inst_name = EXCLUDED.inst_name,
        updated_at = now();
    `, [inst.inst_cd, inst.inst_std_cd, inst.inst_name]);
  }
  console.log(`[Institutions] Upserted ${instMap.size} institutions.`);

  // In-memory set of existing SNs to avoid N network roundtrips
  const existingSnsRes = await db.query(`SELECT sn FROM job_postings;`);
  const existingSnSet = new Set(existingSnsRes.rows.map(r => r.sn));

  // Upsert job postings
  console.log(`\n[Ingest] Upserting job postings...`);
  const startTime = new Date();
  let newInserted = 0;
  let updatedCount = 0;
  let needsReviewCount = 0;

  for (const raw of items) {
    const p = parsePosting(raw);
    if (p.needs_review) needsReviewCount++;

    const isNew = !existingSnSet.has(p.sn);

    await db.query(`
      INSERT INTO job_postings (
        sn, inst_cd, inst_name, title, status, content_hash, first_seen_at, last_seen_at, missed_count,
        start_date, end_date, recruit_count, recruit_type_code, recruit_type_name, hire_type_codes, hire_type_names,
        work_region_codes, work_region_names, work_region_count, is_gyeongbuk_primary, relocation_region,
        is_nonmetro_talent, is_regional_talent, needs_review, ncs_codes, ncs_names, education_code, education_name,
        qualification, disqualification, preference, preference_cond, procedure_info, replacement_yn, src_url,
        has_app_form, has_job_desc, attachments, steps, raw_payload
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, now(), now(), 0,
        $7, $8, $9, $10, $11, $12, $13,
        $14, $15, $16, $17, $18,
        $19, $20, $21, $22, $23, $24, $25,
        $26, $27, $28, $29, $30, $31, $32,
        $33, $34, $35, $36, $37
      )
      ON CONFLICT (sn) DO UPDATE SET
        status = EXCLUDED.status,
        content_hash = EXCLUDED.content_hash,
        last_seen_at = now(),
        missed_count = 0,
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        recruit_count = EXCLUDED.recruit_count,
        recruit_type_code = EXCLUDED.recruit_type_code,
        recruit_type_name = EXCLUDED.recruit_type_name,
        hire_type_codes = EXCLUDED.hire_type_codes,
        hire_type_names = EXCLUDED.hire_type_names,
        work_region_codes = EXCLUDED.work_region_codes,
        work_region_names = EXCLUDED.work_region_names,
        work_region_count = EXCLUDED.work_region_count,
        is_gyeongbuk_primary = EXCLUDED.is_gyeongbuk_primary,
        relocation_region = EXCLUDED.relocation_region,
        is_nonmetro_talent = EXCLUDED.is_nonmetro_talent,
        is_regional_talent = EXCLUDED.is_regional_talent,
        needs_review = EXCLUDED.needs_review,
        ncs_codes = EXCLUDED.ncs_codes,
        ncs_names = EXCLUDED.ncs_names,
        education_code = EXCLUDED.education_code,
        education_name = EXCLUDED.education_name,
        qualification = EXCLUDED.qualification,
        disqualification = EXCLUDED.disqualification,
        preference = EXCLUDED.preference,
        preference_cond = EXCLUDED.preference_cond,
        procedure_info = EXCLUDED.procedure_info,
        replacement_yn = EXCLUDED.replacement_yn,
        src_url = EXCLUDED.src_url,
        has_app_form = EXCLUDED.has_app_form,
        has_job_desc = EXCLUDED.has_job_desc,
        attachments = EXCLUDED.attachments,
        steps = EXCLUDED.steps,
        raw_payload = EXCLUDED.raw_payload,
        updated_at = now();
    `, [
      p.sn, p.inst_cd, p.inst_name, p.title, p.status, p.content_hash,
      p.start_date, p.end_date, p.recruit_count, p.recruit_type_code, p.recruit_type_name, p.hire_type_codes, p.hire_type_names,
      p.work_region_codes, p.work_region_names, p.work_region_count, p.is_gyeongbuk_primary, p.relocation_region,
      p.is_nonmetro_talent, p.is_regional_talent, p.needs_review, p.ncs_codes, p.ncs_names, p.education_code, p.education_name,
      p.qualification, p.disqualification, p.preference, p.preference_cond, p.procedure_info, p.replacement_yn, p.src_url,
      p.has_app_form, p.has_job_desc, JSON.stringify(p.attachments), JSON.stringify(p.steps), JSON.stringify(p.raw_payload)
    ]);

    if (isNew) newInserted++;
    else updatedCount++;
  }

  // ==============================================================================
  // 5. Absent Items Processing (v2 Spec 3-2: Missed Count, Delisted & Closed)
  // ==============================================================================
  console.log(`\n[Absent Items] Processing postings not in current feed...`);
  const feedSns = items.map(it => parseInt(it.recrutPblntSn, 10));

  // 1) Postings absent from feed whose end_date has passed -> 'closed' (DoD 5: must not be delisted)
  const closedRes = await db.query(`
    UPDATE job_postings
    SET status = 'closed', updated_at = now()
    WHERE NOT (sn = ANY($1::int[]))
      AND end_date < CURRENT_DATE
      AND status != 'closed'
    RETURNING sn;
  `, [feedSns]);
  const closedCount = closedRes.rows.length;
  console.log(`[Absent Items] Marked ${closedCount} expired absent postings as 'closed'.`);

  // 2) Postings absent from feed whose end_date is today or in future -> increment missed_count (2 consecutive -> delisted)
  const missedRes = await db.query(`
    UPDATE job_postings
    SET missed_count = missed_count + 1,
        status = CASE WHEN missed_count + 1 >= 2 THEN 'delisted'::job_posting_status ELSE status END,
        updated_at = now()
    WHERE NOT (sn = ANY($1::int[]))
      AND end_date >= CURRENT_DATE
      AND status != 'delisted'
    RETURNING sn, status, missed_count;
  `, [feedSns]);

  const delistedCount = missedRes.rows.filter(r => r.status === 'delisted').length;
  const missed1Count = missedRes.rows.filter(r => r.status !== 'delisted').length;
  console.log(`[Absent Items] Future-deadline absent postings: ${missed1Count} incremented missed_count=1, ${delistedCount} marked as 'delisted' (missed_count >= 2).`);

  const endTime = new Date();
  const runType = mode === 'LIVE' ? 'live-cron' : 'snapshot-replay';

  // Log to ingest_runs
  const ingestRunRes = await db.query(`
    INSERT INTO ingest_runs (
      run_type, target_region, status, total_fetched, new_inserted, updated_count,
      delisted_count, list_calls, detail_calls, quota_exhausted, needs_review_count,
      started_at, completed_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING id, run_type, status, total_fetched, new_inserted, updated_count, delisted_count, list_calls, started_at, completed_at;
  `, [
    runType, 'ALL', 'completed', items.length, newInserted, updatedCount + closedCount,
    delistedCount, listCalls, 0, false, needsReviewCount,
    startTime, endTime
  ]);

  console.log(`\n[Ingestion Summary] Mode: [${mode}] | Fetched: ${items.length}건 | New: ${newInserted}건 | Updated: ${updatedCount}건 | Closed: ${closedCount}건 | Delisted: ${delistedCount}건 | DB Mode: ${dbMode}`);

  // Query verification: getTargetJobs dynamic query
  console.log(`\n===============================================================`);
  console.log(`=== Verification: Dynamic getTargetJobs() SQL Query Execution ===`);
  console.log(`===============================================================`);

  const targetQuery = `
    SELECT sn, inst_name, title, recruit_type_code, hire_type_codes, end_date
    FROM job_postings
    WHERE status = 'open'
      AND 'R600002' = ANY(ncs_codes)
      AND 'R1010' = ANY(hire_type_codes)
      AND recruit_type_code IN ('R2010', 'R2030')
    ORDER BY end_date ASC;
  `;

  const targetRes = await db.query(targetQuery);
  console.log(`[getTargetJobs Query Result] 총 ${targetRes.rows.length}건`);
  console.log(`sn 배열:`, JSON.stringify(targetRes.rows.map(r => r.sn)));

  await db.close();
  return {
    mode,
    dbMode,
    total: items.length,
    newInserted,
    updatedCount,
    closedCount,
    delistedCount,
    listCalls,
    ingestRun: ingestRunRes.rows[0],
    targetJobsCount: targetRes.rows.length,
    targetJobsSns: targetRes.rows.map(r => r.sn)
  };
}

// Auto-run if executed directly
if (process.argv[1]?.endsWith('run-ingest.mjs')) {
  runIngest().then(() => {
    console.log('\n[SUCCESS] Pipeline execution finished.');
    process.exit(0);
  }).catch(err => {
    console.error('\n[FATAL] Pipeline failed:', err);
    process.exit(1);
  });
}
