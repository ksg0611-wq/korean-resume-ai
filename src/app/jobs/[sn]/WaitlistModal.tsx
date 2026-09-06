'use client';

import React, { useState } from 'react';

interface WaitlistModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobTitle: string;
  instName: string;
  sn: number;
}

export default function WaitlistModal({
  isOpen,
  onClose,
  jobTitle,
  instName,
  sn,
}: WaitlistModalProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setError('올바른 이메일 주소를 입력해 주세요.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, sn, instName, jobTitle })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || '신청 처리 중 오류가 발생했습니다.');
      }

      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || '네트워크 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 sm:p-8 text-left transition-all">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-1 rounded-full transition-colors"
          aria-label="닫기"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {!submitted ? (
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold mb-3">
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
              사전 오픈 알림 신청
            </div>

            <h3 className="text-xl font-bold text-gray-900 tracking-tight mb-2">
              공공기관 맞춤형 AI 자소서 엔진 오픈 대기
            </h3>

            <p className="text-sm text-gray-600 mb-4 leading-relaxed">
              <strong className="text-gray-900">[{instName}]</strong> 공고의 직무기술서와 STAR 프레임워크를 연계한 
              공공기관 전용 AI 자소서 자동 완성 기능이 곧 출시됩니다.
              지금 대기자 등록을 하시면 <strong>오픈 알림과 무료 3회 생성 혜택</strong>을 드립니다.
            </p>

            <div className="bg-gray-50 rounded-xl p-3 mb-5 border border-gray-100 text-xs text-gray-700">
              <div className="font-semibold text-gray-800 line-clamp-1">신청 대상 공고</div>
              <div className="text-gray-500 line-clamp-1 mt-0.5">{jobTitle}</div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label htmlFor="waitlist-email" className="block text-xs font-medium text-gray-700 mb-1">
                  알림 받으실 이메일 주소
                </label>
                <input
                  id="waitlist-email"
                  type="email"
                  required
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>

              {error && (
                <p className="text-xs text-red-600 font-medium">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading ? '등록 중...' : '사전 오픈 알림 및 무료 혜택 받기'}
              </button>
            </form>

            <p className="text-[11px] text-gray-400 text-center mt-3">
              ※ 스팸 메일은 일절 발송되지 않으며, 알림 발송 후 안전하게 폐기됩니다.
            </p>
          </div>
        ) : (
          <div className="text-center py-4">
            <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">대기자 등록이 완료되었습니다!</h3>
            <p className="text-sm text-gray-600 mb-5 leading-relaxed">
              <strong>{email}</strong>(으)로 등록되었습니다.<br />
              공공기관 AI 자소서 엔진 오픈 즉시 가장 먼저 안내해 드리겠습니다.
            </p>
            <button
              onClick={onClose}
              className="w-full py-2.5 px-4 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold text-sm transition-colors"
            >
              닫기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
