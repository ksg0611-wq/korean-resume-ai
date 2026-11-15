"use client";

import { useState, type ReactNode } from "react";
import {
  FREE_LIMITS,
  PAID_GENERATIONS_BREAKDOWN,
  REFUND_SUMMARY_TEXT,
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
        입력하신 내용은 AI 생성을 위해 Google 서버로 전송되며 진단 및 입력 원문은 회사 서버에 저장하지 않습니다. 입력 데이터는 Google의 유료 API 정책에 따라 모델 학습에 사용되지 않습니다. 무료 자소서 미리보기 임시 데이터는 결제 후 잠금 해제를 위해 최대 2시간(7,200초) 보관 후 1회 사용 또는 만료 시 자동 파기되며, 유료 결제 결과물은 7일 재열람 링크 제공을 위해 최대 7일간 보관 후 자동 파기됩니다. 면접 질문으로 이어갈 때의 임시 토큰은 최대 10분간 보관 후 조회 즉시 삭제됩니다. 자세한 내용은{" "}
        <a href="/privacy" className="text-blue-600 underline">개인정보처리방침</a>을 확인해 주세요.
      </>
    ),
  },
  {
    question: "무료로 체험할 수 있나요?",
    answer: `결제 없이도 자소서 생성은 일 ${FREE_LIMITS.resume}회, 면접 꼬리질문 생성은 일 ${FREE_LIMITS.interview}회까지 무료로 이용할 수 있습니다. (24시간 기준, 접속 IP별 제한)`,
  },
  {
    question: "결제 후 몇 번까지 생성할 수 있나요?",
    answer: `1회 결제 시 ${PAID_GENERATIONS_BREAKDOWN}이 가능하며, 이용권은 구매일로부터 1년간 유효합니다.`,
  },
  {
    question: "미리보기 잠금해제는 성공했는데 면접 질문 10선만 실패하면 어떻게 되나요?",
    answer:
      `${REFUND_SUMMARY_TEXT} 원칙에 따라, 자소서 4문항 본문이 이미 잠금 해제·저장된 경우 주된 서비스가 제공되었으므로 전액 환불 대상에 해당하지 않으며, 대신 결과 화면에서 추가 생성 횟수 차감 없이 '면접 질문 10선 무료 다시 생성' 버튼으로 무료 재시도를 제공합니다.`,
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
