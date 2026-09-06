'use client';

import React from 'react';
import Link from 'next/link';
import { JobPosting } from '@/types/jobs';

interface JobCardProps {
  job: JobPosting;
  isRecommended?: boolean;
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

function calculateDDay(endDateVal: any): { label: string; isUrgent: boolean; isClosed: boolean } {
  const endDateStr = toDateString(endDateVal);
  if (!endDateStr) return { label: '상시', isUrgent: false, isClosed: false };

  // Parse YYYY-MM-DD
  const parts = endDateStr.split('-');
  if (parts.length < 3) return { label: '상시', isUrgent: false, isClosed: false };

  const [year, month, day] = parts.map(Number);
  const now = new Date();
  
  // Set both to start of day for clean diff
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(year, month - 1, day);
  
  const diffTime = target.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { label: '마감', isUrgent: false, isClosed: true };
  }
  if (diffDays === 0) {
    return { label: 'D-Day', isUrgent: true, isClosed: false };
  }
  if (diffDays <= 7) {
    return { label: `D-${diffDays}`, isUrgent: true, isClosed: false };
  }
  return { label: `D-${diffDays}`, isUrgent: false, isClosed: false };
}

export default function JobCard({ job, isRecommended }: JobCardProps) {
  const dday = calculateDDay(job.end_date);

  return (
    <Link
      href={`/jobs/${job.sn}`}
      className={`group relative flex flex-col justify-between bg-white rounded-2xl p-5 border transition-all duration-200 hover:-translate-y-1 hover:shadow-lg cursor-pointer ${
        isRecommended
          ? 'border-blue-200 hover:border-blue-400 bg-gradient-to-br from-blue-50/40 via-white to-white'
          : 'border-gray-200 hover:border-blue-300'
      }`}
    >
      <div>
        {/* Header Badges */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg line-clamp-1 max-w-[70%]">
            {job.inst_name}
          </span>
          <span
            className={`text-xs font-bold px-2.5 py-1 rounded-lg shrink-0 ${
              dday.isClosed
                ? 'bg-gray-100 text-gray-500'
                : dday.isUrgent
                ? 'bg-red-50 text-red-600 border border-red-200 animate-pulse'
                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            }`}
          >
            {dday.label}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-base font-bold text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2 mb-3 leading-snug">
          {job.title}
        </h3>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {job.recruit_type_name && (
            <span className="text-[11px] font-medium bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md">
              {job.recruit_type_name}
            </span>
          )}
          {job.hire_type_names && job.hire_type_names.slice(0, 2).map((h, idx) => (
            <span key={idx} className="text-[11px] font-medium bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md">
              {h}
            </span>
          ))}
          {job.ncs_names && job.ncs_names.slice(0, 1).map((n, idx) => (
            <span key={idx} className="text-[11px] font-medium bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md">
              {n}
            </span>
          ))}
          {job.work_region_names && job.work_region_names.length > 0 && (
            <span className="text-[11px] font-medium bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md">
              {job.work_region_names.slice(0, 2).join(', ')}
              {job.work_region_names.length > 2 ? ` 외 ${job.work_region_names.length - 2}` : ''}
            </span>
          )}
        </div>
      </div>

      {/* Footer Meta & Action CTA */}
      <div className="pt-3 border-t border-gray-100 flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 text-gray-500 min-w-0">
          <span className="shrink-0">{toDateString(job.end_date) || '상시'} 마감</span>
          <span className="text-gray-300">·</span>
          {job.recruit_count ? (
            <span className="font-medium text-gray-700 shrink-0">{job.recruit_count}명 채용</span>
          ) : (
            <span className="text-gray-400 shrink-0">0명/미정</span>
          )}
        </div>

        <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-600 font-semibold text-xs transition-colors hover:bg-blue-600 hover:text-white group-hover:bg-blue-600 group-hover:text-white shrink-0">
          맞춤 자소서 쓰기 →
        </span>
      </div>
    </Link>
  );
}
