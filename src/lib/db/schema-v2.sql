-- ==============================================================================
-- Korea Resume AI — 공공기관 채용공고 수집 파이프라인 (DDL 스펙 v2 확정안)
-- ==============================================================================

-- 1. 채용공고 상태 ENUM 타입
DO $$ BEGIN
    CREATE TYPE job_posting_status AS ENUM ('open', 'closed', 'delisted');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. 공공기관 마스터 테이블 (institutions)
-- API 응답 실사 검증 필드(inst_cd, inst_std_cd, inst_name) 기반 및 수동 관리 컬럼 구성
CREATE TABLE IF NOT EXISTS institutions (
    inst_cd             VARCHAR(32) PRIMARY KEY,              -- 공시기관코드 (pblntInstCd, e.g. 'C0028')
    inst_std_cd         VARCHAR(32),                          -- 행정표준기관코드 (pbadmsStdInstCd, e.g. 'B552015')
    inst_name           VARCHAR(128) NOT NULL,                -- 기관명 (instNm, e.g. '국민연금공단')
    
    -- 수동 관리 컬럼 (API 미제공 필드로 자동 추정 금지, 관리자 직접 입력)
    region_sido         VARCHAR(32),                          -- 수동 입력: 기관 소재 시도
    region_sigungu      VARCHAR(32),                          -- 수동 입력: 기관 소재 시군구
    is_relocated        BOOLEAN NOT NULL DEFAULT false,       -- 수동 입력: 혁신도시 이전기관 여부
    relocation_region   VARCHAR(32),                          -- 수동 입력: 이전 대상 지역 (e.g. '전북', '경북')
    is_verified         BOOLEAN NOT NULL DEFAULT false,       -- 수동 입력: 관리자 확인 완료 여부
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_institutions_std_cd ON institutions(inst_std_cd);
CREATE INDEX IF NOT EXISTS idx_institutions_verified ON institutions(is_verified);

-- 3. 채용공고 메인 테이블 (job_postings)
-- v2 스펙: status, content_hash, first/last_seen_at, missed_count, 지역인재 파싱 반영
CREATE TABLE IF NOT EXISTS job_postings (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sn                      INTEGER NOT NULL UNIQUE,          -- 채용공시 일련번호 (recrutPblntSn, 멱등 수집 기준키)
    inst_cd                 VARCHAR(32) NOT NULL REFERENCES institutions(inst_cd),
    inst_name               VARCHAR(128) NOT NULL,
    title                   VARCHAR(512) NOT NULL,            -- recrutPbancTtl
    
    -- 상태 및 라이프사이클 (물리 삭제 절대 금지)
    status                  job_posting_status NOT NULL DEFAULT 'open',
    content_hash            VARCHAR(64) NOT NULL,             -- SHA-256 해시값 (내용 변경 감지용)
    first_seen_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    missed_count            INTEGER NOT NULL DEFAULT 0,       -- 목록 미관측 연속 횟수 (2회 연속 시 delisted)
    
    -- 일정 및 인원 (d_day는 end_date 기반 가상/클라이언트 연산으로 처리)
    start_date              DATE NOT NULL,                    -- pbancBgngYmd
    end_date                DATE NOT NULL,                    -- pbancEndYmd
    recruit_count           INTEGER,                          -- recrutNope
    
    -- 채용 및 고용 형태 (기재부 공식 v1.2 체계: R1000 고용형태, R2000 채용구분)
    recruit_type_code       VARCHAR(32),                      -- recrutSe (R2010 신입, R2030 신입+경력 등)
    recruit_type_name       VARCHAR(64),                      -- recrutSeNm
    hire_type_codes         TEXT[],                           -- hireTypeLst (R1010 정규직, R1020 무기계약직 등)
    hire_type_names         TEXT[],                           -- hireTypeNmLst
    
    -- 근무지 및 지역 지표 (v2 스펙 3-3)
    work_region_codes       TEXT[] NOT NULL,                  -- workRgnLst
    work_region_names       TEXT[] NOT NULL,                  -- workRgnNmLst
    work_region_count       INTEGER NOT NULL DEFAULT 1,       -- 근무지역 개수 (배열 length)
    is_gyeongbuk_primary    BOOLEAN NOT NULL DEFAULT false,   -- 경북 단독 여부 (work_region_count = 1 AND 'R3021' 포함)
    
    -- 이전지역인재 및 지역인재 분류 (v2 스펙 3-1, 4-2)
    relocation_region       VARCHAR(32),                      -- 이전지역인재 파싱 지역 (e.g. '전북', '경북')
    is_nonmetro_talent      BOOLEAN NOT NULL DEFAULT false,   -- 비수도권 지역인재 문구 포함 여부
    is_regional_talent      BOOLEAN NOT NULL DEFAULT false,   -- relocation_region IS NOT NULL OR is_nonmetro_talent
    needs_review            BOOLEAN NOT NULL DEFAULT false,   -- 관리자 수동 검수 큐 플래그
    
    -- 직무 및 자격/전형 상세
    ncs_codes               TEXT[],                           -- ncsCdLst
    ncs_names               TEXT[],                           -- ncsCdNmLst (원문 마침표 표기 그대로 저장)
    education_code          VARCHAR(64),                      -- acbgCondLst (R7000 계열, 복수 코드 시 32자 초과 가능)
    education_name          VARCHAR(128),                     -- acbgCondNmLst
    qualification           TEXT,                             -- aplyQlfcCn
    disqualification        TEXT,                             -- disqlfcRsn
    preference              TEXT,                             -- prefCn
    preference_cond         TEXT,                             -- prefCondCn
    procedure_info          TEXT,                             -- scrnprcdrMthdExpln
    replacement_yn          VARCHAR(1) DEFAULT 'N',           -- replmprYn
    src_url                 VARCHAR(512),                     -- srcUrl
    
    -- 첨부파일 및 전형 단계 메타데이터 (3주차 STAR 문항 DB 원재료)
    has_app_form            BOOLEAN NOT NULL DEFAULT false,   -- Type B(입사지원서 양식) 포함 여부
    has_job_desc            BOOLEAN NOT NULL DEFAULT false,   -- Type C(직무기술서) 포함 여부
    attachments             JSONB DEFAULT '[]'::jsonb,        -- files 메타 (sortNo, type, name, url)
    steps                   JSONB DEFAULT '[]'::jsonb,        -- steps 전형단계 배열
    raw_payload             JSONB,                            -- API 원본 백업
    
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 검색 및 필터 인덱스
CREATE INDEX IF NOT EXISTS idx_job_postings_sn ON job_postings(sn);
CREATE INDEX IF NOT EXISTS idx_job_postings_relocation ON job_postings(relocation_region, status);
CREATE INDEX IF NOT EXISTS idx_job_postings_ncs ON job_postings USING GIN (ncs_codes);
CREATE INDEX IF NOT EXISTS idx_job_postings_region_codes ON job_postings USING GIN (work_region_codes);
CREATE INDEX IF NOT EXISTS idx_job_postings_status ON job_postings(status);
CREATE INDEX IF NOT EXISTS idx_job_postings_end_date ON job_postings(end_date);
CREATE INDEX IF NOT EXISTS idx_job_postings_content_hash ON job_postings(content_hash);
CREATE INDEX IF NOT EXISTS idx_job_postings_needs_review ON job_postings(needs_review) WHERE needs_review = true;

-- 4. 수집 배치 실행 이력 테이블 (ingest_runs)
-- v2 스펙: target_region='ALL', list/detail calls, quota_exhausted, needs_review_count 반영
CREATE TABLE IF NOT EXISTS ingest_runs (
    id                      BIGSERIAL PRIMARY KEY,
    run_type                VARCHAR(32) NOT NULL DEFAULT 'scheduled', -- 'scheduled' | 'manual'
    target_region           VARCHAR(16) NOT NULL DEFAULT 'ALL',       -- v2 전국 기본값 'ALL'
    status                  VARCHAR(16) NOT NULL,                     -- 'started' | 'completed' | 'failed'
    total_fetched           INTEGER NOT NULL DEFAULT 0,               -- 목록 API 조회된 총 공고 건수
    new_inserted            INTEGER NOT NULL DEFAULT 0,               -- 신규 INSERT 건수
    updated_count           INTEGER NOT NULL DEFAULT 0,               -- 변경 UPDATE 건수
    delisted_count          INTEGER NOT NULL DEFAULT 0,               -- delisted 처리 건수
    list_calls              INTEGER NOT NULL DEFAULT 0,               -- /list 호출 횟수
    detail_calls            INTEGER NOT NULL DEFAULT 0,               -- /detail 호출 횟수
    quota_exhausted         BOOLEAN NOT NULL DEFAULT false,           -- 일일 800건 상한 도달 여부
    needs_review_count      INTEGER NOT NULL DEFAULT 0,               -- needs_review 플래그 발생 건수
    started_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at            TIMESTAMPTZ,
    error_log               TEXT
);

CREATE INDEX IF NOT EXISTS idx_ingest_runs_started_at ON ingest_runs(started_at DESC);

-- 5. 수집 대기/사전신청 테이블 (waitlist_signups)
-- Vercel 서버리스 영구 보존용 Postgres 테이블
CREATE TABLE IF NOT EXISTS waitlist_signups (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sn                      INTEGER NOT NULL,
    email                   VARCHAR(256) NOT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(email, sn)
);

CREATE INDEX IF NOT EXISTS idx_waitlist_signups_sn ON waitlist_signups(sn);
CREATE INDEX IF NOT EXISTS idx_waitlist_signups_email ON waitlist_signups(email);
CREATE INDEX IF NOT EXISTS idx_waitlist_signups_created_at ON waitlist_signups(created_at DESC);

-- ==============================================================================
-- 6. 관리자 검수 편의 쿼리 (Views / Useful Queries)
-- ==============================================================================

-- [쿼리 1] 소재지 및 이전기관 미검수 기관 목록 조회
-- SELECT inst_cd, inst_std_cd, inst_name, region_sido, is_relocated, relocation_region, is_verified, created_at
-- FROM institutions
-- WHERE is_verified = false
-- ORDER BY created_at DESC;

-- [쿼리 2] 수동 검수 대상 공고 큐 조회 (needs_review = true)
-- SELECT sn, inst_name, title, relocation_region, is_nonmetro_talent, preference_cond, preference
-- FROM job_postings
-- WHERE needs_review = true AND status = 'open'
-- ORDER BY first_seen_at DESC;

