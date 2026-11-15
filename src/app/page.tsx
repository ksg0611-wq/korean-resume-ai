import type { Metadata } from "next";
import HomeClient from "./HomeClient";
import { BUSINESS_INFO } from "@/lib/siteConfig";

// 루트 layout에는 canonical을 두지 않고(전 페이지 상속 방지) 각 페이지가 자기 URL을 선언합니다.
export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
};

export default function HomePage() {
  return <HomeClient kakaoChannelUrl={BUSINESS_INFO.kakaoChannelUrl} />;
}
