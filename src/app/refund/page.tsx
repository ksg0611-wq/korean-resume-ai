import type { Metadata } from "next";
import PolicyShell, { PolicySection } from "@/components/PolicyShell";
import { REFUND_SUMMARY_TEXT } from "@/lib/policy";
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
      <PolicySection heading="2. 시스템 오류 시 전액 환불 및 부분 실패 재시도 예외">
        <p className="font-semibold text-gray-900">
          {REFUND_SUMMARY_TEXT}
        </p>
        <p>
          서비스 시스템 오류로 인해 최초 결제 후 자소서 결과물(4문항 완성본 또는 미리보기 잠금해제 본문)이 1회도 정상 생성되지 않은 경우, 토스페이먼츠 API를 통해 자동 전액 환불 처리되며 고객센터({b.email}) 문의 시에도 확인 후 100% 환불해 드립니다.
        </p>
        <p>
          <strong>(부분 실패 예외 안내)</strong> 무료 미리보기 결제 후 자소서 4문항 본문 잠금해제가 정상 완료되어 제공되었으나 동반 생성되는 예상 면접 질문 10선만 일시 지연·실패한 경우에는 이미 주된 디지털 콘텐츠(자소서 완성본)가 제공되었으므로 전액 환불 사유에 해당하지 않습니다. 이 경우 추가 횟수 차감 없이 결과 화면에서 &apos;면접 질문 10선 무료 다시 생성&apos; 기능을 통해 무료 재시도를 제공합니다.
        </p>
      </PolicySection>
      <PolicySection heading="3. 환불 문의 방법">
        <p>이메일({b.email})로 결제 시 사용한 주문번호와 문의 내용을 보내주세요.</p>
        {b.csPhone && <p>{`고객센터: ${b.csPhone}`}</p>}
      </PolicySection>
    </PolicyShell>
  );
}
