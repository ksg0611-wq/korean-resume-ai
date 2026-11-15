import type { Metadata } from "next";
import PolicyShell, { PolicySection } from "@/components/PolicyShell";
import { BUSINESS_INFO } from "@/lib/siteConfig";

export const metadata: Metadata = {
  title: "서비스 소개 | Korea Resume AI",
  description: "Korea Resume AI는 STAR 프레임워크와 AI 기술로 자기소개서 초안과 면접 꼬리질문 준비를 돕는 서비스입니다.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  const b = BUSINESS_INFO;
  return (
    <PolicyShell title="서비스 소개">
      <PolicySection heading="Korea Resume AI">
        <p>
          <strong>Korea Resume AI</strong>는 STAR 프레임워크와 AI 기술을 결합하여 취업 준비생들의 자기소개서 및 면접 준비를 돕는 서비스입니다.
        </p>
        <p>
          본 서비스는 개인 개발 프로젝트로 운영되며, 최상의 결과물을 제공하기 위해 지속적으로 모델과 프롬프트를 개선하고 있습니다.
        </p>
      </PolicySection>
      <PolicySection heading="제공 서비스">
        <ul className="list-disc pl-5 space-y-1">
          <li>AI 자기소개서 초안 생성 (STAR 구조)</li>
          <li>AI 면접 꼬리질문 생성</li>
          <li>공공기관 채용공고 큐레이션</li>
        </ul>
      </PolicySection>
      <PolicySection heading="운영 사업자">
        <p>
          {b.companyName} ({b.companyNameEn}) · 대표자 {b.representative} · 사업자등록번호 {b.businessRegistrationNo}
        </p>
        <p>문의: {b.email}</p>
      </PolicySection>
    </PolicyShell>
  );
}
