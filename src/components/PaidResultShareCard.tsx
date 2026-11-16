"use client";

import { useState } from "react";
import { BUSINESS_INFO } from "@/lib/siteConfig";
import { RESULT_TTL_DAYS, withAiDraftNoticeText } from "@/lib/policy";

export function downloadTextFile(filename: string, content: string): void {
  const normalizedContent = withAiDraftNoticeText(content);
  const blob = new Blob([normalizedContent], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

interface PaidResultShareCardProps {
  orderId: string;
  serviceType: "resume" | "interview";
  resultText: string;
  resultUrl: string;
  expiresAt?: string | null;
  receiptUrl?: string | null;
  remainingGenerations?: number | null;
  emailSent?: boolean;
  kakaoChannelUrl?: string | null;
}

export default function PaidResultShareCard({
  orderId,
  serviceType,
  resultText,
  resultUrl,
  expiresAt,
  receiptUrl,
  remainingGenerations,
  emailSent,
  kakaoChannelUrl,
}: PaidResultShareCardProps) {
  const [copied, setCopied] = useState(false);

  const effectiveKakaoUrl = kakaoChannelUrl ?? BUSINESS_INFO.kakaoChannelUrl;
  const fullUrl =
    typeof window !== "undefined" && resultUrl.startsWith("/")
      ? `${window.location.origin}${resultUrl}`
      : resultUrl;

  const formattedExpiry = expiresAt
    ? (() => {
        try {
          return new Intl.DateTimeFormat("ko-KR", {
            timeZone: "Asia/Seoul",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }).format(new Date(expiresAt));
        } catch {
          return expiresAt;
        }
      })()
    : null;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = fullUrl;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleDownloadTxt = () => {
    const prefix = serviceType === "interview" ? "면접질문" : "자기소개서";
    downloadTextFile(`${prefix}_${orderId}.txt`, resultText);
  };

  return (
    <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50/70 p-4 sm:p-5 text-sm text-gray-800 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-600 text-white text-xs font-bold">
            유료 결과 보관
          </span>
          <span className="font-bold text-blue-900">
            {RESULT_TTL_DAYS}일간 열람 가능하니 링크를 저장하세요
          </span>
        </div>
        {typeof remainingGenerations === "number" && (
          <span className="text-xs font-semibold text-blue-800 bg-white px-2.5 py-1 rounded-lg border border-blue-200">
            남은 생성 횟수: {remainingGenerations}회
          </span>
        )}
      </div>

      <div className="bg-white border border-blue-100 rounded-lg px-3 py-2 text-xs text-gray-600 break-all">
        <a
          href={resultUrl}
          className="text-blue-700 underline font-medium hover:text-blue-900"
        >
          {fullUrl}
        </a>
        {formattedExpiry && (
          <p className="text-[11px] text-gray-500 mt-1">
            주문번호: <span className="font-mono">{orderId}</span> · 열람 만료: {formattedExpiry} (KST)
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={handleCopyLink}
          className="px-3.5 py-2 bg-white hover:bg-gray-50 border border-blue-300 text-blue-700 font-bold text-xs rounded-lg transition-colors cursor-pointer"
        >
          {copied ? "링크가 복사되었습니다 ✓" : "재열람 링크 복사"}
        </button>

        <button
          type="button"
          onClick={handleDownloadTxt}
          className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
        >
          .txt 파일 다운로드
        </button>

        {receiptUrl && (
          <a
            href={receiptUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-2 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 font-semibold text-xs rounded-lg transition-colors"
          >
            토스 영수증 확인 ↗
          </a>
        )}

        {effectiveKakaoUrl && (
          <a
            href={effectiveKakaoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-2 bg-yellow-300 hover:bg-yellow-400 text-gray-900 font-bold text-xs rounded-lg transition-colors"
          >
            카카오톡 채널 문의 ↗
          </a>
        )}
      </div>

      {emailSent && (
        <p className="text-xs text-emerald-700 font-medium">
          입력하신 이메일로 재열람 링크와 토스 영수증 안내를 발송했습니다.
        </p>
      )}
    </div>
  );
}
