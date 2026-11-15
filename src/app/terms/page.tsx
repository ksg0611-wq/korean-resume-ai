import type { Metadata } from "next";
import Link from "next/link";
import PolicyShell, { PolicySection } from "@/components/PolicyShell";
import {
  INTERVIEW_MAX_EVALUATIONS,
  PAID_GENERATIONS_BREAKDOWN,
  PAID_INTERVIEW_BREAKDOWN,
  PRICING_PLANS,
  RESULT_TTL_DAYS,
} from "@/lib/policy";

export const metadata: Metadata = {
  title: "이용약관 | Korea Resume AI",
  description: "Korea Resume AI 서비스 이용약관",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <PolicyShell title="이용약관">
      <PolicySection heading="제1조 (목적)">
        <p>본 약관은 Korea Resume AI(이하 &quot;서비스&quot;)의 이용 조건 및 절차에 관한 사항을 규정함을 목적으로 합니다.</p>
      </PolicySection>
      <PolicySection heading="제2조 (서비스의 제공)">
        <p>
          본 서비스는 AI 언어 모델을 활용하여 사용자가 입력한 내용을 기반으로 자기소개서 초안·진단, 공공기관 NCS 기반 모의면접 질문, 답변 채점·동적 꼬리질문 및 면접 대비 노트를 생성하여 제공합니다. 제공된 결과물에 대한 최종 검토 및 활용 책임은 사용자 본인에게 있습니다.
        </p>
      </PolicySection>
      <PolicySection heading="제3조 (서비스 이용 및 제한)">
        <p>사용자는 어뷰징, 불법적인 목적, 타인의 권리를 침해하는 용도로 본 서비스를 이용할 수 없습니다.</p>
      </PolicySection>
      <PolicySection heading="제4조 (결제, 상품 구성 및 환불)">
        <p>
          유료 서비스의 결제는 토스페이먼츠를 통해 처리되며, 청약철회 및 환불에 관한 사항은{" "}
          <Link href="/refund" className="text-blue-600 underline">환불정책</Link>에 따릅니다.
        </p>
        <p>
          {`유료 상품은 ① 자소서 단독(${PRICING_PLANS.resume_single.price.toLocaleString("ko-KR")}원, ${PAID_GENERATIONS_BREAKDOWN}), ② 면접 시뮬레이터 단독(${PRICING_PLANS.interview_single.price.toLocaleString("ko-KR")}원, 1개 활성 세션 = ${PAID_INTERVIEW_BREAKDOWN}), ③ 자소서+면접 통합 패키지(${PRICING_PLANS.bundle.price.toLocaleString("ko-KR")}원), ④ 자소서 기존 구매자 면접 업그레이드(+${PRICING_PLANS.interview_upgrade.price.toLocaleString("ko-KR")}원)으로 구성됩니다.`}
        </p>
        <p>
          {`미사용 이용권 식별 정보의 유효기간은 구매일로부터 1년이며, 생성이 시작된 유료 면접 세션 및 자동 저장·갱신되는 면접 대비 노트·재열람 결과는 최초 생성일로부터 ${RESULT_TTL_DAYS}일간 보관되어 재접속 이어하기(잔여 채점 최대 ${INTERVIEW_MAX_EVALUATIONS}회 한도 내)가 가능합니다.`}
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
