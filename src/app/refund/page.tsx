import type { Metadata } from "next";
import PolicyShell, { PolicySection } from "@/components/PolicyShell";
import { BUSINESS_INFO } from "@/lib/siteConfig";

export const metadata: Metadata = {
  title: "환불정책 | Korea Resume AI",
  description: "Korea Resume AI 유료 서비스 청약철회 및 환불정책",
  alternates: { canonical: "/refund" },
};

export default function RefundPage() {
  const b = BUSINESS_INFO;
  return (
    <PolicyShell title="환불정책">
      <PolicySection heading="1. 청약철회 및 환불 제한">
        <p className="text-red-600 font-semibold">
          디지털 콘텐츠 특성상 AI 생성이 시작된 이후에는 단순 변심에 의한 환불이 불가합니다.
        </p>
        <p>
          결제 화면에서 위 내용에 대한 동의 후 결제가 진행되며, 이는 「전자상거래 등에서의 소비자보호에 관한 법률」에 따른 디지털 콘텐츠 제공 개시 시 청약철회 제한 사항에 해당합니다.
        </p>
      </PolicySection>
      <PolicySection heading="2. 시스템 오류 시 전액 환불">
        <p>
          서비스 시스템 오류로 인해 결제 후 질문이나 자소서가 정상적으로 생성되지 않은 경우, 고객센터({b.email})로 문의해주시면 확인 후 100% 환불 처리해 드립니다.
        </p>
      </PolicySection>
      <PolicySection heading="3. 환불 문의 방법">
        <p>이메일({b.email})로 결제 시 사용한 주문번호와 문의 내용을 보내주세요.</p>
        {b.csPhone && <p>{`고객센터: ${b.csPhone}`}</p>}
      </PolicySection>
    </PolicyShell>
  );
}
