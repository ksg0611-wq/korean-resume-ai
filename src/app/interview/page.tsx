import type { Metadata } from "next";
import InterviewClient from "./InterviewClient";
import { BUSINESS_INFO } from "@/lib/siteConfig";
import { getServerPaymentLockState } from "@/lib/paymentAccess";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "공공기관 AI 면접 시뮬레이터 (NCS 15문항 · 3단계 꼬리질문) | Korea Resume AI",
  description:
    "공공기관 경영·회계·사무 및 NCS 10대 직업기초능력 기반 직무 10문항+인성 5문항, 100점 루브릭 채점, 자소서 일관성 검증 및 3단계 압박 꼬리질문 시뮬레이터.",
  alternates: {
    canonical: "/interview",
  },
};

export default function InterviewPage() {
  const { paymentLocked } = getServerPaymentLockState();
  return (
    <InterviewClient
      kakaoChannelUrl={BUSINESS_INFO.kakaoChannelUrl}
      paymentLocked={paymentLocked}
    />
  );
}
