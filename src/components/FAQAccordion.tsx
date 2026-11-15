"use client";

import { useState, type ReactNode } from "react";
import {
  FREE_LIMITS,
  INTERVIEW_FREE_QUESTION_COUNT,
  INTERVIEW_MAX_EVALUATIONS,
  PAID_GENERATIONS_BREAKDOWN,
  PAID_INTERVIEW_BREAKDOWN,
  PRICING_PLANS,
  REFUND_SUMMARY_TEXT,
  RESULT_TTL_DAYS,
} from "@/lib/policy";

const faqs: { question: string; answer: ReactNode }[] = [
  {
    question: "AI가 작성한 티가 나지 않나요?",
    answer: "STAR 기법과 직무별 키워드 매핑으로 자연스러운 경험 중심 문장을 만듭니다.",
  },
  {
    question: "개인정보는 안전하게 보호되나요?",
    answer: (
      <>
        입력하신 내용은 AI 생성·채점을 위해 Google 서버로 전송되며 Google의 유료 API 정책에 따라 모델 학습에 사용되지 않습니다. 자소서 진단·생성 입력 원문은 회사 서버에 영구 저장하지 않으며, 무료 자소서 미리보기 및 무료 면접 세션(interview_session:*)은 최대 2시간(7,200초) 보관 후 자동 파기됩니다. 유료 자소서 결과, 유료 면접 세션 및 자동 저장되는 면접 대비 노트(result:*)는 {RESULT_TTL_DAYS}일간 재열람·이어하기 링크 제공을 위해 임시 보관된 뒤 자동 파기되며, 자소서 결과 화면에서 면접으로 이어갈 때의 임시 전달 토큰은 최대 10분간 보관 후 조회 즉시 삭제됩니다. 자세한 내용은{" "}
        <a href="/privacy" className="text-blue-600 underline">개인정보처리방침</a>을 확인해 주세요.
      </>
    ),
  },
  {
    question: "무료로 체험할 수 있나요?",
    answer: `결제 없이도 자소서 진단·미리보기는 일 ${FREE_LIMITS.resume}회, 공공기관 모의면접(핵심 ${INTERVIEW_FREE_QUESTION_COUNT}문항 · 답변 채점 1회 및 1단계 꼬리질문 체험)은 일 ${FREE_LIMITS.interview}회까지 별도로 무료 이용할 수 있습니다. (24시간 기준, 접속 IP별 제한)`,
  },
  {
    question: "결제 후 몇 번까지 생성할 수 있나요? 이용권 유효기간과 재열람 기한은 어떻게 되나요?",
    answer: `자소서 패키지(${PRICING_PLANS.resume_single.price.toLocaleString("ko-KR")}원)는 ${PAID_GENERATIONS_BREAKDOWN}, 면접 시뮬레이터 단독(${PRICING_PLANS.interview_single.price.toLocaleString("ko-KR")}원)은 1개 활성 세션 내 ${PAID_INTERVIEW_BREAKDOWN}(자소서+면접 통합 ${PRICING_PLANS.bundle.price.toLocaleString("ko-KR")}원, 자소서 구매자 업그레이드 +${PRICING_PLANS.interview_upgrade.price.toLocaleString("ko-KR")}원)가 제공됩니다. 미사용 이용권은 구매일로부터 1년간 유효하며, 유료 면접 세션과 자동 저장·갱신되는 면접 대비 노트는 최초 생성일로부터 ${RESULT_TTL_DAYS}일간 재열람 링크를 통해 이어서 연습(최대 ${INTERVIEW_MAX_EVALUATIONS}회)할 수 있습니다.`,
  },
  {
    question: "결제 후 일부 기능만 실패하거나 채점 중 오류가 나면 어떻게 되나요?",
    answer:
      `${REFUND_SUMMARY_TEXT} 원칙에 따라 최초 결과물(자소서 완성본 또는 면접 15문항 세트)이 1회도 생성되지 않으면 자동 전액 환불됩니다. 면접 15문항 제공 후 개별 답변 채점 중 오류가 나면 ${INTERVIEW_MAX_EVALUATIONS}회 채점 한도가 차감되지 않고 즉시 복구되며, 통합 패키지 등에서 면접 초기 생성만 일시 지연된 경우에는 무료 재시도 또는 고객센터 확인을 통한 수동 부분 환불을 지원합니다.`,
  },
];

export default function FAQAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="w-full max-w-2xl mx-auto mt-8 bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
        <h3 className="text-lg font-bold text-gray-800">자주 묻는 질문 (FAQ)</h3>
      </div>
      <div className="divide-y divide-gray-100">
        {faqs.map((faq, index) => (
          <div key={index} className="px-6 py-4">
            <button
              onClick={() => toggle(index)}
              className="w-full flex justify-between items-center text-left focus:outline-none"
            >
              <span className="font-medium text-gray-800 flex items-center">
                <span className="text-blue-600 font-bold mr-2">Q.</span>
                {faq.question}
              </span>
              <span className="ml-4 text-gray-400">
                <svg
                  className={`w-5 h-5 transition-transform duration-200 ${openIndex === index ? "transform rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </span>
            </button>
            {openIndex === index && (
              <div className="mt-3 text-gray-600 pl-6 flex items-start text-sm leading-relaxed">
                <span className="text-red-500 font-bold mr-2">A.</span>
                <p>{faq.answer}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
