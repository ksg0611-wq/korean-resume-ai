import type { Metadata } from "next";
import Link from "next/link";
import PolicyShell, { PolicySection } from "@/components/PolicyShell";

export const metadata: Metadata = {
  title: "이용약관 | Korea Resume AI",
  description: "Korea Resume AI 서비스 이용약관",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <PolicyShell title="이용약관">
      <PolicySection heading="제1조 (목적)">
        <p>본 약관은 Korean Resume AI(이하 &quot;서비스&quot;)의 이용 조건 및 절차에 관한 사항을 규정함을 목적으로 합니다.</p>
      </PolicySection>
      <PolicySection heading="제2조 (서비스의 제공)">
        <p>
          본 서비스는 AI 언어 모델을 활용하여 사용자가 입력한 내용을 기반으로 자기소개서 초안 및 면접 질문을 생성하여 제공합니다. 제공된 결과물에 대한 최종 책임은 사용자 본인에게 있습니다.
        </p>
      </PolicySection>
      <PolicySection heading="제3조 (서비스 이용 및 제한)">
        <p>사용자는 어뷰징, 불법적인 목적, 타인의 권리를 침해하는 용도로 본 서비스를 이용할 수 없습니다.</p>
      </PolicySection>
      <PolicySection heading="제4조 (결제 및 환불)">
        <p>
          유료 서비스의 결제는 토스페이먼츠를 통해 처리되며, 청약철회 및 환불에 관한 사항은{" "}
          <Link href="/refund" className="text-blue-600 underline">환불정책</Link>에 따릅니다.
        </p>
      </PolicySection>
      <PolicySection heading="제5조 (개인정보 보호)">
        <p>
          서비스는 이용자의 개인정보를{" "}
          <Link href="/privacy" className="text-blue-600 underline">개인정보처리방침</Link>에 따라 처리합니다. 이용자는 주민등록번호, 연락처 등 민감한 개인정보를 입력해서는 안 됩니다.
        </p>
      </PolicySection>
    </PolicyShell>
  );
}
