"use client";

import { useState, type ReactNode } from "react";
import {
  FREE_LIMITS,
  PAID_GENERATIONS,
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
        입력하신 내용은 AI 생성을 위해 Google 서버로 전송되며, 회사의 DB·Redis에는 저장하지 않습니다. 생성 결과를 면접 질문으로 이어가실 때만 임시 토큰으로 최대 10분간 보관되고 조회 즉시 삭제됩니다. 자세한 내용은{" "}
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
    answer: `1회 결제 시 ${PAID_GENERATIONS}회 작성 및 재생성이 가능합니다.`,
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
