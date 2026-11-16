'use client';

import React from 'react';
import Link from 'next/link';
import { trackConversionEvent } from '@/lib/analytics';

interface JobDetailActionProps {
  sn: number;
  instName: string;
  jobTitle: string;
  srcUrl?: string | null;
  dDayLabel?: string;
  isUrgent?: boolean;
}

export default function JobDetailAction({
  sn,
  srcUrl,
  dDayLabel,
  isUrgent,
}: JobDetailActionProps) {
  return (
    <div className="pt-6 border-t border-gray-200 space-y-3">
      {dDayLabel && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full font-extrabold border ${
              isUrgent
                ? "bg-red-50 text-red-700 border-red-200"
                : "bg-blue-50 text-blue-700 border-blue-200"
            }`}
          >
            {dDayLabel === "상시" ? "상시 채용" : `접수 마감 ${dDayLabel}`}
          </span>
          <span className="text-gray-600 font-medium">
            지원 전 AI 자소서 진단 및 공고 맞춤 4문항 패키지로 바로 대비하세요.
          </span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        {/* AI 자소서 작성하기 — 팝업 없이 해당 공고(sn) 맞춤 홈으로 즉시 이동 */}
        <Link
          href={`/?sn=${encodeURIComponent(String(sn))}`}
          onClick={() =>
            trackConversionEvent({
              event: 'job_cta_click',
              source: 'jobs',
              planType: 'resume_single',
            })
          }
          className="flex-1 py-3.5 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span>AI 자소서 작성하기</span>
          {dDayLabel && (
            <span className="text-[11px] bg-white/20 px-2 py-0.5 rounded-md font-extrabold">
              {dDayLabel}
            </span>
          )}
        </Link>

        {/* 이 공고 맞춤 모의면접 준비 CTA */}
        <Link
          href={`/interview?sn=${encodeURIComponent(String(sn))}`}
          onClick={() =>
            trackConversionEvent({
              event: 'job_cta_click',
              source: 'jobs',
              planType: 'interview_single',
            })
          }
          className="py-3.5 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-sm transition-colors text-center flex items-center justify-center gap-1.5"
        >
          <span>이 공고 면접 준비 →</span>
        </Link>

        {/* 원문 공고 보기 */}
        {srcUrl && (
          <a
            href={srcUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="py-3.5 px-5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold text-sm transition-colors text-center"
          >
            공식 공고 원문 ↗
          </a>
        )}
      </div>
    </div>
  );
}
