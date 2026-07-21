"use client";

import { useState } from "react";

const faqs = [
  {
    question: "AI가 작성한 티가 나지 않나요?",
    answer: "STAR 기법과 직무별 키워드 매핑으로 자연스러운 경험 중심 문장을 만듭니다."
  },
  {
    question: "개인정보는 안전하게 보호되나요?",
    answer: "자소서 원문은 1회성 토큰으로 처리되며 조회 즉시 서버에서 파기됩니다."
  },
  {
    question: "결제 후 몇 번까지 생성할 수 있나요?",
    answer: "1회 결제 시 3회 작성 및 재생성이 가능합니다."
  }
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
