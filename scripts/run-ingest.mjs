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
    const remoteUrls = [
      process.env.DIRECT_URL,
      process.env.DATABASE_URL,
      process.env.SUPABASE_DB_URL
    ].filter(Boolean);

    let connected = false;
    let lastError = null;

    for (const url of remoteUrls) {
      // Mask password for logging
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

  // Parse attachments and steps if present in raw payload
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
function getGovernmentApiKey() {
  const key = process.env.DATA_GO_KR_API_KEY;
  if (key) return key.trim().replace(/^['"]|['"]$/g, '');
  throw new Error('[API Key Error] DATA_GO_KR_API_KEY not found in process.env or .env.local');
}

async function fetchWithRetry(url, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      return await res.json();
    } catch (err) {
      const isLast = attempt === maxRetries;
      const causeStr = err.cause ? ` [Cause: ${err.cause.code || err.cause}]` : '';
      console.warn(`[Live API] Page fetch attempt ${attempt}/${maxRetries} failed: ${err.message}${causeStr}`);
      if (isLast) {
        throw new Error(`[Live API Gateway Error] Failed after ${maxRetries} attempts to reach apis.data.go.kr. External government gateway server appears to be experiencing downtime or network timeout.`);
      }
      console.log(`[Live API] Retrying in ${2 * attempt}s...`);
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
}

export async function fetchLiveOngoingJobs() {
  const apiKey = getGovernmentApiKey();
  const allItems = [];
  let page = 1;
  let listCalls = 0;
  let hasMore = true;

  console.log(`\n[Live API Gateway] Calling https://apis.data.go.kr/1051000/recruitment/list ...`);

  while (hasMore) {
    listCalls++;
    const url = `https://apis.data.go.kr/1051000/recruitment/list?resultType=json&ongoingYn=Y&numOfRows=100&pageNo=${page}&serviceKey=${encodeURIComponent(apiKey)}`;
    
    console.log(`[Live API] Fetching page ${page} (call #${listCalls})...`);
    const data = await fetchWithRetry(url, 3);
    const items = data.result || [];
    const totalCount = data.totalCount || null;

    allItems.push(...items);
    console.log(`[Live API] Page ${page}: fetched ${items.length} items (accumulated: ${allItems.length}${totalCount ? ` / total: ${totalCount}` : ''})`);

    // Termination conditions: fewer items than requested, or reached totalCount, or safety ceiling
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
  // Determine mode: CLI flag (--live vs --snapshot) > options.mode > ENV
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
    // Verify input snapshot
    if (!fs.existsSync(snapshotPath)) {
      throw new Error(`Snapshot file not found at ${snapshotPath}`);
    }
    const snapshotRaw = fs.readFileSync(snapshotPath);
    const snapshotHash = crypto.createHash('sha256').update(snapshotRaw).digest('hex');
    items = JSON.parse(snapshotRaw.toString('utf-8'));
    listCalls = 6; // Historical equivalent calls for the 510-item snapshot
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

  // Upsert job postings
  console.log(`[Ingest] Upserting job postings...`);
  const startTime = new Date();
  let newInserted = 0;
  let updatedCount = 0;
  let needsReviewCount = 0;

  for (const raw of items) {
    const p = parsePosting(raw);
    if (p.needs_review) needsReviewCount++;

    const existing = await db.query(`SELECT sn FROM job_postings WHERE sn = $1`, [p.sn]);
    const isNew = existing.rows.length === 0;

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

  const endTime = new Date();
  const runType = mode === 'LIVE' ? 'live-cron' : 'snapshot-replay';

  // Log to ingest_runs
  await db.query(`
    INSERT INTO ingest_runs (
      run_type, target_region, status, total_fetched, new_inserted, updated_count,
      delisted_count, list_calls, detail_calls, quota_exhausted, needs_review_count,
      started_at, completed_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13);
  `, [
    runType, 'ALL', 'completed', items.length, newInserted, updatedCount,
    0, listCalls, 0, false, needsReviewCount,
    startTime, endTime
  ]);

  console.log(`\n[Ingestion Summary] Mode: [${mode}] | Total: ${items.length}건 | New: ${newInserted}건 | Updated: ${updatedCount}건 | DB Mode: ${dbMode}`);

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

