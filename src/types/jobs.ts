export type JobPostingStatus = 'open' | 'closed' | 'delisted';

export interface JobAttachment {
  sortNo: number;
  type: string; // 'A': 공고문, 'B': 입사지원서 양식, 'C': 직무기술서, etc.
  fileNm: string;
  fileUrl: string;
}

export interface JobStep {
  stepNo?: number;
  stepNm?: string;
  stepExpln?: string;
  [key: string]: any;
}

export interface JobPosting {
  id: string;
  sn: number;
  inst_cd: string;
  inst_name: string;
  title: string;
  status: JobPostingStatus;
  content_hash: string;
  first_seen_at: string;
  last_seen_at: string;
  missed_count: number;
  start_date: string;
  end_date: string;
  recruit_count: number | null;
  recruit_type_code: string | null;
  recruit_type_name: string | null;
  hire_type_codes: string[];
  hire_type_names: string[];
  work_region_codes: string[];
  work_region_names: string[];
  work_region_count: number;
  is_gyeongbuk_primary: boolean;
  relocation_region: string | null;
  is_nonmetro_talent: boolean;
  is_regional_talent: boolean;
  needs_review: boolean;
  ncs_codes: string[];
  ncs_names: string[];
  education_code: string | null;
  education_name: string | null;
  qualification: string | null;
  disqualification: string | null;
  preference: string | null;
  preference_cond: string | null;
  procedure_info: string | null;
  replacement_yn: string | null;
  src_url: string | null;
  has_app_form: boolean;
  has_job_desc: boolean;
  attachments: JobAttachment[];
  steps: JobStep[];
  created_at: string;
  updated_at: string;
}

export interface JobListParams {
  ncsCode?: string;
  recruitType?: string;
  hireType?: string;
  region?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface JobListResult {
  jobs: JobPosting[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
