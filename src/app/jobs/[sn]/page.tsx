import React from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getJobDetail } from '@/lib/db/jobs';
import JobDetailAction from './JobDetailAction';

export const dynamic = 'force-dynamic';

interface JobDetailPageProps {
  params: {
    sn: string;
  };
}

export async function generateMetadata({ params }: JobDetailPageProps): Promise<Metadata> {
  const sn = parseInt(params.sn, 10);
  const job = await getJobDetail(sn);
  if (!job) {
    return { title: '공고를 찾을 수 없습니다 | Korea Resume AI' };
  }
  return {
    title: `[${job.inst_name}] ${job.title} | Korea Resume AI`,
    description: `${job.inst_name} ${job.recruit_type_name || ''} 채용공고 상세 및 AI 자소서 준비`,
  };
}

function toDateString(dateVal: any): string {
  if (!dateVal) return '';
  if (dateVal instanceof Date) {
    return dateVal.toISOString().split('T')[0];
  }
  const str = String(dateVal).trim();
  if (str.includes('T')) {
    return str.split('T')[0];
  }
  return str;
}

function calculateDDay(endDateVal: any): { label: string; isUrgent: boolean } {
  const endDateStr = toDateString(endDateVal);
  if (!endDateStr) return { label: '상시', isUrgent: false };
  const parts = endDateStr.split('-');
  if (parts.length < 3) return { label: '상시', isUrgent: false };

  const [year, month, day] = parts.map(Number);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(year, month - 1, day);
  const diffTime = target.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { label: '마감', isUrgent: false };
  if (diffDays === 0) return { label: '오늘 마감 (D-Day)', isUrgent: true };
  return { label: `D-${diffDays}`, isUrgent: diffDays <= 7 };
}

export default async function JobDetailPage({ params }: JobDetailPageProps) {
  const sn = parseInt(params.sn, 10);
  if (isNaN(sn)) notFound();

  const job = await getJobDetail(sn);
  if (!job) notFound();

  const dday = calculateDDay(job.end_date);

  return (
    <main className="min-h-screen bg-gray-50 py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Back Link */}
        <div className="mb-6">
          <Link
            href="/jobs"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-blue-600 transition-colors"
          >
            ← 공고 목록으로 돌아가기
          </Link>
        </div>

        {/* Header Card */}
        <div className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-200 shadow-sm mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <span className="text-sm font-bold text-blue-700 bg-blue-50 px-3 py-1 rounded-lg">
              {job.inst_name}
            </span>
            <span
              className={`text-xs font-extrabold px-3 py-1 rounded-lg ${
                dday.isUrgent
                  ? 'bg-red-50 text-red-600 border border-red-200 animate-pulse'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}
            >
              {dday.label}
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight mb-4 leading-tight">
            {job.title}
          </h1>

          {/* Quick Info Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 border-y border-gray-100 text-xs">
            <div>
              <div className="text-gray-400 mb-0.5">채용 구분</div>
              <div className="font-semibold text-gray-800">{job.recruit_type_name || '-'}</div>
            </div>
            <div>
              <div className="text-gray-400 mb-0.5">고용 형태</div>
              <div className="font-semibold text-gray-800">
                {job.hire_type_names?.join(', ') || '-'}
              </div>
            </div>
            <div>
              <div className="text-gray-400 mb-0.5">채용 인원</div>
              <div className="font-semibold text-gray-800">
                {job.recruit_count ? `${job.recruit_count}명` : '0명/미정'}
              </div>
            </div>
            <div>
              <div className="text-gray-400 mb-0.5">근무 지역</div>
              <div className="font-semibold text-gray-800 line-clamp-1">
                {job.work_region_names?.join(', ') || '-'}
              </div>
            </div>
          </div>

          {/* Schedule */}
          <div className="mt-4 flex flex-wrap items-center justify-between text-xs text-gray-600">
            <span>접수 기간: <strong className="text-gray-900">{toDateString(job.start_date) || '-'} ~ {toDateString(job.end_date) || '-'}</strong></span>
            {job.relocation_region && (
              <span className="text-indigo-600 font-medium bg-indigo-50 px-2.5 py-0.5 rounded-md">
                이전지역인재: {job.relocation_region}
              </span>
            )}
          </div>

          {/* Action Trigger */}
          <JobDetailAction
            sn={job.sn}
            instName={job.inst_name}
            jobTitle={job.title}
            srcUrl={job.src_url}
          />
        </div>

        {/* Attachments Section */}
        {job.attachments && job.attachments.length > 0 && (
          <div className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-200 shadow-sm mb-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              공고 첨부파일 ({job.attachments.length}건)
            </h2>
            <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
              {job.attachments.map((file, idx) => (
                <div key={idx} className="p-3.5 flex items-center justify-between bg-gray-50/50 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3 overflow-hidden mr-3">
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-700 shrink-0">
                      {file.type === 'B' ? '입사지원서' : file.type === 'C' ? '직무기술서' : '공고문'}
                    </span>
                    <span className="text-xs font-medium text-gray-800 truncate">{file.fileNm}</span>
                  </div>
                  {file.fileUrl ? (
                    <a
                      href={file.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-bold text-blue-600 hover:text-blue-800 shrink-0 hover:underline"
                    >
                      다운로드 ↗
                    </a>
                  ) : (
                    <span className="text-xs text-gray-400 shrink-0">URL 미제공</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Detailed Sections */}
        <div className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-200 shadow-sm space-y-6">
          <h2 className="text-lg font-bold text-gray-900 border-b border-gray-100 pb-3">
            모집요강 상세
          </h2>

          {job.qualification && (
            <div>
              <h3 className="text-sm font-bold text-gray-900 mb-1.5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                응시 자격
              </h3>
              <div className="text-xs text-gray-700 whitespace-pre-line leading-relaxed bg-gray-50 rounded-xl p-4 border border-gray-100">
                {job.qualification}
              </div>
            </div>
          )}

          {job.preference && (
            <div>
              <h3 className="text-sm font-bold text-gray-900 mb-1.5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                우대 사항
              </h3>
              <div className="text-xs text-gray-700 whitespace-pre-line leading-relaxed bg-gray-50 rounded-xl p-4 border border-gray-100">
                {job.preference}
                {job.preference_cond && (
                  <div className="mt-2 pt-2 border-t border-gray-200 text-gray-600">
                    {job.preference_cond}
                  </div>
                )}
              </div>
            </div>
          )}

          {job.procedure_info && (
            <div>
              <h3 className="text-sm font-bold text-gray-900 mb-1.5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                전형 절차 및 방법
              </h3>
              <div className="text-xs text-gray-700 whitespace-pre-line leading-relaxed bg-gray-50 rounded-xl p-4 border border-gray-100">
                {job.procedure_info}
              </div>
            </div>
          )}

          {job.disqualification && (
            <div>
              <h3 className="text-sm font-bold text-gray-900 mb-1.5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
                결격 사유
              </h3>
              <div className="text-xs text-gray-700 whitespace-pre-line leading-relaxed bg-gray-50 rounded-xl p-4 border border-gray-100">
                {job.disqualification}
              </div>
            </div>
          )}

          {/* NCS Information */}
          {job.ncs_names && job.ncs_names.length > 0 && (
            <div className="pt-4 border-t border-gray-100">
              <span className="text-xs text-gray-400">직무 분류(NCS): </span>
              <span className="text-xs font-semibold text-gray-800">
                {job.ncs_names.join(', ')}
              </span>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
