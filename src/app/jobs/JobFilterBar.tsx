'use client';

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function JobFilterBar() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentNcs = searchParams.get('ncsCode') || '';
  const currentRecruit = searchParams.get('recruitType') || '';
  const currentHire = searchParams.get('hireType') || '';
  const currentSearch = searchParams.get('search') || '';

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete('page'); // reset page
    router.push(`/jobs?${params.toString()}`);
  };

  return (
    <div className="bg-white rounded-2xl p-4 sm:p-5 border border-gray-200 shadow-sm mb-8 space-y-4">
      {/* Search Input */}
      <div className="relative">
        <input
          type="text"
          placeholder="공공기관명 또는 채용공고 제목으로 검색..."
          defaultValue={currentSearch}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              updateFilter('search', (e.target as HTMLInputElement).value);
            }
          }}
          onBlur={(e) => updateFilter('search', e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
        />
        <svg
          className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100 text-xs font-medium">
        <span className="text-gray-400 py-1.5 mr-1 font-normal">직무(NCS):</span>
        <button
          onClick={() => updateFilter('ncsCode', '')}
          className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
            !currentNcs
              ? 'bg-blue-600 text-white font-semibold shadow-sm'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          전체 직무
        </button>
        <button
          onClick={() => updateFilter('ncsCode', 'R600002')}
          className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
            currentNcs === 'R600002'
              ? 'bg-blue-600 text-white font-semibold shadow-sm'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          경영·회계·사무 (추천)
        </button>

        <span className="text-gray-400 py-1.5 ml-2 mr-1 font-normal">구분:</span>
        <button
          onClick={() => updateFilter('recruitType', '')}
          className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
            !currentRecruit
              ? 'bg-gray-800 text-white font-semibold'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          전체
        </button>
        <button
          onClick={() => updateFilter('recruitType', 'R2010')}
          className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
            currentRecruit === 'R2010'
              ? 'bg-gray-800 text-white font-semibold'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          신입
        </button>
        <button
          onClick={() => updateFilter('recruitType', 'R2030')}
          className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
            currentRecruit === 'R2030'
              ? 'bg-gray-800 text-white font-semibold'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          신입+경력
        </button>

        <span className="text-gray-400 py-1.5 ml-2 mr-1 font-normal">고용:</span>
        <button
          onClick={() => updateFilter('hireType', currentHire === 'R1010' ? '' : 'R1010')}
          className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
            currentHire === 'R1010'
              ? 'bg-emerald-600 text-white font-semibold shadow-sm'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          정규직만 보기
        </button>
      </div>
    </div>
  );
}
