import type { Metadata } from "next";
import InterviewClient from "./InterviewClient";
import { BUSINESS_INFO } from "@/lib/siteConfig";

export const metadata: Metadata = {
  alternates: {
    canonical: "/interview",
  },
};

export default function InterviewPage() {
  return <InterviewClient kakaoChannelUrl={BUSINESS_INFO.kakaoChannelUrl} />;
}
