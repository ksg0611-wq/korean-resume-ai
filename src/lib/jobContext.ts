import { getJobDetail } from "@/lib/db/jobs";
import type { JobPosting } from "@/types/jobs";

export interface VerifiedResumeJobContext {
  sn: number;
  instName: string;
  title: string;
  ncsNames: string[];
  recruitTypeName: string | null;
  qualification: string | null;
  preference: string | null;
  preferenceCond: string | null;
  procedureInfo: string | null;
}

export interface HomeJobContextSummary {
  sn: number;
  instName: string;
  title: string;
  ncsNames: string[];
  dDayLabel: string;
  isUrgent: boolean;
  endDate: string;
  recruitTypeName: string | null;
  hasQualification: boolean;
  hasPreference: boolean;
}

export function parseJobSn(raw: unknown): number | null {
  if (typeof raw === "number") {
    return Number.isInteger(raw) && raw > 0 ? raw : null;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const num = Number(trimmed);
    return Number.isSafeInteger(num) && num > 0 ? num : null;
  }
  return null;
}

export function toJobDateString(dateVal: unknown): string {
  if (!dateVal) return "";
  if (dateVal instanceof Date) {
    return dateVal.toISOString().split("T")[0];
  }
  const str = String(dateVal).trim();
  if (str.includes("T")) {
    return str.split("T")[0];
  }
  return str;
}

export function calculateJobDDay(endDateVal: unknown): {
  label: string;
  isUrgent: boolean;
} {
  const endDateStr = toJobDateString(endDateVal);
  if (!endDateStr) return { label: "상시", isUrgent: false };
  const parts = endDateStr.split("-");
  if (parts.length < 3) return { label: "상시", isUrgent: false };

  const [year, month, day] = parts.map(Number);
  if (!year || !month || !day) return { label: "상시", isUrgent: false };

  const nowParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const kstYear = Number(nowParts.find((p) => p.type === "year")?.value || 1970);
  const kstMonth = Number(nowParts.find((p) => p.type === "month")?.value || 1);
  const kstDay = Number(nowParts.find((p) => p.type === "day")?.value || 1);

  const todayUtcMs = Date.UTC(kstYear, kstMonth - 1, kstDay);
  const targetUtcMs = Date.UTC(year, month - 1, day);
  const diffDays = Math.round((targetUtcMs - todayUtcMs) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { label: "마감", isUrgent: false };
  if (diffDays === 0) return { label: "오늘 마감 (D-Day)", isUrgent: true };
  return { label: `D-${diffDays}`, isUrgent: diffDays <= 7 };
}

export function buildHomeJobContextSummary(
  job: JobPosting
): HomeJobContextSummary {
  const dday = calculateJobDDay(job.end_date);
  return {
    sn: job.sn,
    instName: job.inst_name,
    title: job.title,
    ncsNames: Array.isArray(job.ncs_names) ? job.ncs_names : [],
    dDayLabel: dday.label,
    isUrgent: dday.isUrgent,
    endDate: toJobDateString(job.end_date),
    recruitTypeName: job.recruit_type_name ?? null,
    hasQualification: Boolean(job.qualification && job.qualification.trim()),
    hasPreference: Boolean(
      (job.preference && job.preference.trim()) ||
        (job.preference_cond && job.preference_cond.trim())
    ),
  };
}

/**
 * 클라이언트 입력을 신뢰하지 않고 서버가 직접 DB(JobPosting)에서 공고 자격요건·우대사항·직무를 조회합니다.
 * 유효하지 않은 sn이거나 조회 실패 시 null 반환 (일반 홈/생성 흐름 폴백).
 */
export async function resolveVerifiedJobContext(
  rawSn: unknown
): Promise<VerifiedResumeJobContext | null> {
  const sn = parseJobSn(rawSn);
  if (!sn) return null;

  try {
    const job = await getJobDetail(sn);
    if (!job) return null;

    return {
      sn: job.sn,
      instName: job.inst_name,
      title: job.title,
      ncsNames: Array.isArray(job.ncs_names) ? job.ncs_names : [],
      recruitTypeName: job.recruit_type_name ?? null,
      qualification: job.qualification?.trim() || null,
      preference: job.preference?.trim() || null,
      preferenceCond: job.preference_cond?.trim() || null,
      procedureInfo: job.procedure_info?.trim() || null,
    };
  } catch (err) {
    console.warn(`[JobContext] Failed to load job detail for sn=${sn}:`, err);
    return null;
  }
}

function truncateField(value: string | null | undefined, maxLen: number): string {
  const clean = (value || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen)}...`;
}

export function formatJobContextPromptBlock(
  ctx: VerifiedResumeJobContext | null | undefined,
  purpose: "diagnose" | "generate" | "interview10"
): string {
  if (!ctx) return "";

  const ncsStr =
    ctx.ncsNames.length > 0 ? ctx.ncsNames.join(", ") : "일반 사무·기술 직무";
  const qualStr = truncateField(ctx.qualification, 900);
  const prefCombined = [ctx.preference, ctx.preferenceCond]
    .filter((s) => Boolean(s && s.trim()))
    .join(" / ");
  const prefStr = truncateField(prefCombined, 700);

  const lines: string[] = [
    `[실제 지원 채용공고 정보 (서버 DB 검증 완료 · sn=${ctx.sn})]`,
    `- 기관명: ${ctx.instName}`,
    `- 공고명: ${ctx.title}`,
    `- NCS 직무분류: ${ncsStr}`,
  ];
  if (ctx.recruitTypeName) {
    lines.push(`- 채용구분: ${ctx.recruitTypeName}`);
  }
  if (qualStr) {
    lines.push(`- 공고 응시 자격요건: ${qualStr}`);
  }
  if (prefStr) {
    lines.push(`- 공고 우대사항: ${prefStr}`);
  }

  if (purpose === "diagnose") {
    lines.push(
      "- [공고 반영 평가 지침] 위 공고의 NCS 직무·자격요건·우대사항과의 부합도를 `alignment.jobFit` 및 `weaknesses`, `sampleFix`에 구체적으로 반영해 평가하세요. 단, 지원자 원문에 없는 수치·경력·자격증을 지어내지 마세요."
    );
  } else if (purpose === "generate") {
    lines.push(
      "- [공고 맞춤 작성 지침] 위 공고의 기관 특성·NCS 직무·자격요건·우대사항 키워드에 맞춰 설득력을 높이되, 지원자 입력 원문에 없는 자격·경력·성과 수치는 절대 창작하지 말고 `[본인 수치 입력]` 규칙을 엄격히 준수하세요."
    );
  } else {
    lines.push(
      "- [공고 맞춤 면접 출제 지침] 위 공고의 NCS 직무·자격요건·우대사항 검증 관점을 예상 질문 10선과 답변 가이드에 자연스럽게 반영하세요."
    );
  }

  return `\n${lines.join("\n")}\n`;
}
