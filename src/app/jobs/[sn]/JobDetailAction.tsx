'use client';

import React, { useState } from 'react';
import WaitlistModal from './WaitlistModal';

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
  instName,
  jobTitle,
  srcUrl,
  dDayLabel,
  isUrgent,
}: JobDetailActionProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
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
          {/* AI 자소서 작성하기 버튼 (사전 오픈 알림 신청으로 연결 - 결제 플로우 금지) */}
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex-1 py-3.5 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span>AI 자소서 작성하기 (사전 오픈 알림)</span>
            {dDayLabel && (
              <span className="text-[11px] bg-white/20 px-2 py-0.5 rounded-md font-extrabold">
                {dDayLabel}
              </span>
            )}
          </button>

          {/* 메인 작성기에서 직접 작성 */}
          <a
            href={`/?jobTitle=${encodeURIComponent(`[${instName}] ${jobTitle}`)}`}
            className="py-3.5 px-5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-sm transition-colors text-center flex items-center justify-center gap-1.5"
          >
            <span>공고 맞춤 자소서 쓰기 ↗</span>
            {dDayLabel && (
              <span
                className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${
                  isUrgent
                    ? "bg-red-100 text-red-700"
                    : "bg-blue-200/70 text-blue-800"
                }`}
              >
                {dDayLabel}
              </span>
            )}
          </a>

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

      {/* 사전 오픈 알림 모달 */}
      <WaitlistModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        sn={sn}
        instName={instName}
        jobTitle={jobTitle}
      />
    </>
  );
}
