import { dbQuery } from './client';
import { JobPosting, JobListParams, JobListResult } from '@/types/jobs';

/**
 * 1차 타겟 추천 공고 (실시간 동적 쿼리)
 * 조건: status = 'open'
 *       AND 'R600002' = ANY(ncs_codes)  (경영·회계·사무)
 *       AND 'R1010' = ANY(hire_type_codes) (정규직)
 *       AND recruit_type_code IN ('R2010', 'R2030') (신입 또는 신입+경력)
 * ※ 특정 시점의 30건 등 하드코딩 금지, 매일 실시간 마감/신규 공고에 맞춰 동적 조회.
 */
export async function getTargetJobs(): Promise<JobPosting[]> {
  const sql = `
    SELECT *
    FROM job_postings
    WHERE status = 'open'
      AND 'R600002' = ANY(ncs_codes)
      AND 'R1010' = ANY(hire_type_codes)
      AND recruit_type_code IN ('R2010', 'R2030')
    ORDER BY end_date ASC, sn DESC;
  `;
  return await dbQuery<JobPosting>(sql);
}

/**
 * 공고 목록 필터링 및 페이지네이션 조회
 */
export async function getJobsList(params: JobListParams = {}): Promise<JobListResult> {
  const {
    ncsCode,
    recruitType,
    hireType,
    region,
    search,
    page = 1,
    limit = 12
  } = params;

  const conditions: string[] = ["status = 'open'"];
  const values: any[] = [];
  let paramIdx = 1;

  if (ncsCode) {
    conditions.push(`$${paramIdx} = ANY(ncs_codes)`);
    values.push(ncsCode);
    paramIdx++;
  }

  if (recruitType) {
    conditions.push(`recruit_type_code = $${paramIdx}`);
    values.push(recruitType);
    paramIdx++;
  }

  if (hireType) {
    conditions.push(`$${paramIdx} = ANY(hire_type_codes)`);
    values.push(hireType);
    paramIdx++;
  }

  if (region) {
    conditions.push(`$${paramIdx} = ANY(work_region_codes)`);
    values.push(region);
    paramIdx++;
  }

  if (search && search.trim()) {
    conditions.push(`(title ILIKE $${paramIdx} OR inst_name ILIKE $${paramIdx})`);
    values.push(`%${search.trim()}%`);
    paramIdx++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // 1. Total Count
  const countSql = `SELECT count(*)::int as total FROM job_postings ${whereClause};`;
  const countRes = await dbQuery<{ total: number }>(countSql, values);
  const total = countRes[0]?.total || 0;

  // 2. Paginated Jobs
  const offset = Math.max(0, (page - 1) * limit);
  const listSql = `
    SELECT *
    FROM job_postings
    ${whereClause}
    ORDER BY end_date ASC, sn DESC
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1};
  `;
  const jobs = await dbQuery<JobPosting>(listSql, [...values, limit, offset]);

  return {
    jobs,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  };
}

/**
 * 단일 공고 상세 및 첨부파일 메타 조회
 */
export async function getJobDetail(sn: number): Promise<JobPosting | null> {
  const sql = `
    SELECT *
    FROM job_postings
    WHERE sn = $1
    LIMIT 1;
  `;
  const rows = await dbQuery<JobPosting>(sql, [sn]);
  return rows[0] || null;
}
