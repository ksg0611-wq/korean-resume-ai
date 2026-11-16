import type { Metadata } from "next";
import HomeClient from "./HomeClient";
import { BUSINESS_INFO } from "@/lib/siteConfig";
import { getServerPaymentLockState } from "@/lib/paymentAccess";
import { getJobDetail } from "@/lib/db/jobs";
import {
  buildHomeJobContextSummary,
  parseJobSn,
  type HomeJobContextSummary,
} from "@/lib/jobContext";

export const dynamic = "force-dynamic";

// 루트 layout에는 canonical을 두지 않고(전 페이지 상속 방지) 각 페이지가 자기 URL을 선언합니다.
export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
};

export default async function HomePage({
  searchParams,
}: {
  searchParams?: { sn?: string | string[] };
}) {
  const { paymentLocked } = getServerPaymentLockState();
  const rawSn = Array.isArray(searchParams?.sn)
    ? searchParams?.sn[0]
    : searchParams?.sn;
  const sn = parseJobSn(rawSn);

  let initialJobContext: HomeJobContextSummary | null = null;
  if (sn) {
    try {
      const job = await getJobDetail(sn);
      if (job) {
        initialJobContext = buildHomeJobContextSummary(job);
      }
    } catch (err) {
      console.warn(`[HomePage] Failed to load job context for sn=${sn}:`, err);
    }
  }

  return (
    <HomeClient
      kakaoChannelUrl={BUSINESS_INFO.kakaoChannelUrl}
      paymentLocked={paymentLocked}
      initialJobContext={initialJobContext}
    />
  );
}
