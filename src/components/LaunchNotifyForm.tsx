"use client";

import { useState } from "react";
import { trackConversionEvent } from "@/lib/analytics";
import { LAUNCH_NOTIFY_CONSENT_TEXT, type LaunchNotifySource } from "@/lib/launchNotify";

type Status = "idle" | "submitting" | "done" | "error";

export default function LaunchNotifyForm({ source = "resume" }: { source?: LaunchNotifySource }) {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  const emailId = `launch-notify-email-${source}`;
  const consentId = `launch-notify-consent-${source}`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "submitting") return;
    if (!consent) {
      setStatus("error");
      setMessage("오픈 안내를 받으려면 수신 동의에 체크해 주세요.");
      return;
    }

    setStatus("submitting");
    setMessage("");
    try {
      const res = await fetch("/api/launch-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, marketingConsent: consent, source, website }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        setStatus("error");
        setMessage(data?.message || "신청 처리 중 오류가 발생했습니다.");
        return;
      }
      setStatus("done");
      setMessage(data.message);
      trackConversionEvent({ event: "launch_notify_signup", dedupeKey: "launch_notify_signup" });
    } catch {
      setStatus("error");
      setMessage("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  if (status === "done") {
    return (
      <p role="status" className="text-sm font-semibold text-emerald-700 break-keep">
        ✓ {message}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="text-left space-y-2 pt-2" noValidate>
      <label htmlFor={emailId} className="block text-xs font-bold text-slate-700">
        결제 오픈 알림 받기
      </label>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          id={emailId}
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder="이메일 주소"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 min-w-0 px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          className="px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-bold whitespace-nowrap"
        >
          {status === "submitting" ? "신청 중..." : "알림 신청"}
        </button>
      </div>
      {/* 봇 차단용 숨김 필드 — 사람은 보거나 입력하지 않습니다 */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        className="hidden"
      />
      <label htmlFor={consentId} className="flex items-start gap-2 text-[11px] sm:text-xs text-slate-600 break-keep cursor-pointer">
        <input
          id={consentId}
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 shrink-0"
        />
        <span>
          {LAUNCH_NOTIFY_CONSENT_TEXT}{" "}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
            개인정보처리방침
          </a>
        </span>
      </label>
      {status === "error" && message && (
        <p role="alert" className="text-xs text-red-600">
          {message}
        </p>
      )}
    </form>
  );
}
