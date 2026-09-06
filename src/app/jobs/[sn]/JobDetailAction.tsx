'use client';

import React, { useState } from 'react';
import WaitlistModal from './WaitlistModal';

interface JobDetailActionProps {
  sn: number;
  instName: string;
  jobTitle: string;
  srcUrl?: string | null;
}

export default function JobDetailAction({
  sn,
  instName,
  jobTitle,
  srcUrl,
}: JobDetailActionProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-gray-200">
        {/* AI 자소서 작성하기 버튼 (사전 오픈 알림 신청으로 연결 - 결제 플로우 금지) */}
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex-1 py-3.5 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          AI 자소서 작성하기 (사전 오픈 알림)
        </button>

        {/* 메인 작성기에서 직접 작성 */}
        <a
          href={`/?jobTitle=${encodeURIComponent(`[${instName}] ${jobTitle}`)}`}
          className="py-3.5 px-5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-sm transition-colors text-center flex items-center justify-center gap-1"
        >
          기본 작성기에서 쓰기 ↗
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
