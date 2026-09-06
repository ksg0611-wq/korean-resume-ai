import React, { Suspense } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { getTargetJobs, getJobsList } from '@/lib/db/jobs';
import JobCard from './JobCard';
import JobFilterBar from './JobFilterBar';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '공공기관 채용공고 큐레이션 | Korea Resume AI',
  description: '기획재정부 알리오 공식 API 기반 실시간 공공기관 채용공고 및 경영·사무 직무 맞춤형 큐레이션',
};

interface JobsPageProps {
  searchParams: {
    ncsCode?: string;
    recruitType?: string;
    hireType?: string;
    region?: string;
    search?: string;
    page?: string;
  };
}

export default async function JobsPage({ searchParams }: JobsPageProps) {
  const currentPage = parseInt(searchParams.page || '1', 10);
  
  // 1. 추천 타겟 공고 동적 조회 (NCS R600002 + 정규직 R1010 + 신입/신경)
  const targetJobs = await getTargetJobs();

  // 2. 전체 필터링 목록 조회
  const listResult = await getJobsList({
    ncsCode: searchParams.ncsCode,
    recruitType: searchParams.recruitType,
    hireType: searchParams.hireType,
    region: searchParams.region,
    search: searchParams.search,
    page: currentPage,
    limit: 12
  });

  return (
    <main className="min-h-screen bg-gray-50 py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Page Header */}
        <div className="mb-8 text-center sm:text-left">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200 mb-3">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            공공데이터포털 실시간 검증 연계
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight leading-tight">
            공공기관 채용공고 큐레이션
          </h1>
          <p className="mt-2 text-base text-gray-600">
            기획재정부 알리오 공식 연동으로 정규직 신입 및 경영·사무 핵심 채용공고를 실시간 선별합니다.
          </p>
        </div>

        {/* 1. 상단 추천 공고 영역 (동적 N건) */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <span className="text-blue-600">★</span> 오늘의 추천 공고{' '}
                <span className="inline-flex items-center justify-center bg-blue-600 text-white text-xs font-bold px-2.5 py-0.5 rounded-full">
                  {targetJobs.length}건
                </span>
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                경영·회계·사무 직무 정규직 신입/경력 통합 추천 공고 (실시간 마감순)
              </p>
            </div>
          </div>

          {targetJobs.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {targetJobs.slice(0, 6).map((job) => (
                <JobCard key={job.sn} job={job} isRecommended={true} />
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-8 text-center border border-gray-200 text-gray-500 text-sm">
              현재 추천 조건에 부합하는 진행 중인 공고가 없습니다.
            </div>
          )}
        </section>

        {/* 2. 검색 및 필터 바 */}
        <Suspense fallback={<div className="h-24 bg-gray-100 rounded-2xl animate-pulse mb-8" />}>
          <JobFilterBar />
        </Suspense>

        {/* 3. 전체 공고 목록 영역 */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">
              전체 채용공고{' '}
              <span className="text-sm font-normal text-gray-500">
                (총 {listResult.total.toLocaleString()}건)
              </span>
            </h2>
            <span className="text-xs text-gray-400">
              {currentPage} / {listResult.totalPages || 1} 페이지
            </span>
          </div>

          {listResult.jobs.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {listResult.jobs.map((job) => (
                <JobCard key={job.sn} job={job} />
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-12 text-center border border-gray-200">
              <p className="text-gray-500 text-sm mb-2">조건에 일치하는 채용공고가 없습니다.</p>
              <Link
                href="/jobs"
                className="text-xs text-blue-600 font-semibold hover:underline"
              >
                필터 초기화
              </Link>
            </div>
          )}

          {/* Pagination */}
          {listResult.totalPages > 1 && (
            <div className="mt-8 flex justify-center items-center gap-2">
              {currentPage > 1 && (
                <Link
                  href={`/jobs?page=${currentPage - 1}`}
                  className="px-3.5 py-2 rounded-xl bg-white border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  이전
                </Link>
              )}
              <span className="text-xs text-gray-600 font-medium px-3">
                {currentPage} / {listResult.totalPages}
              </span>
              {currentPage < listResult.totalPages && (
                <Link
                  href={`/jobs?page=${currentPage + 1}`}
                  className="px-3.5 py-2 rounded-xl bg-white border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  다음
                </Link>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
