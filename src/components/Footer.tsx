"use client";

import { useState } from "react";

function Modal({ isOpen, onClose, title, children }: { isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 focus:outline-none">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-6 text-sm text-gray-700 max-h-[70vh] overflow-y-auto leading-relaxed">
          {children}
        </div>
        <div className="px-6 py-4 bg-gray-50 text-right">
          <button onClick={onClose} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition">
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Footer() {
  const [modalContent, setModalContent] = useState<{ title: string; content: React.ReactNode } | null>(null);

  const openModal = (title: string, content: React.ReactNode) => {
    setModalContent({ title, content });
  };

  const closeModal = () => {
    setModalContent(null);
  };

  const policies = {
    intro: (
      <div>
        <p className="mb-2"><strong>Korean Resume AI</strong>는 STAR 프레임워크와 AI 기술을 결합하여 취업 준비생들의 자기소개서 및 면접 준비를 돕는 서비스입니다.</p>
        <p>본 서비스는 개인 개발 프로젝트로 운영되며, 최상의 결과물을 제공하기 위해 지속적으로 모델과 프롬프트를 개선하고 있습니다.</p>
      </div>
    ),
    terms: (
      <div>
        <p className="mb-2"><strong>제1조 (목적)</strong><br />본 약관은 Korean Resume AI(이하 "서비스")의 이용 조건 및 절차에 관한 사항을 규정함을 목적으로 합니다.</p>
        <p className="mb-2"><strong>제2조 (서비스의 제공)</strong><br />본 서비스는 AI 언어 모델을 활용하여 사용자가 입력한 내용을 기반으로 자기소개서 초안 및 면접 질문을 생성하여 제공합니다. 제공된 결과물에 대한 최종 책임은 사용자 본인에게 있습니다.</p>
        <p><strong>제3조 (서비스 이용 및 제한)</strong><br />사용자는 어뷰징, 불법적인 목적, 타인의 권리를 침해하는 용도로 본 서비스를 이용할 수 없습니다.</p>
      </div>
    ),
    privacy: (
      <div className="space-y-4">
        <div>
          <p className="font-semibold mb-1">1. 수집하는 개인정보 항목</p>
          <p>서비스는 결제 처리(Toss Payments 연동) 및 서비스 제공을 위해 최소한의 정보를 수집할 수 있습니다. 사용자가 입력한 자소서 원문은 개인을 식별할 수 없는 상태로 AI 모델에 전송되며, 임시 토큰으로 저장된 후 조회 즉시 파기(Burn-on-read)되거나 10분 내로 소멸됩니다.</p>
        </div>
        <div>
          <p className="font-semibold mb-1">2. 개인정보의 제3자 제공</p>
          <p>입력된 자소서 내용은 서비스 제공(생성) 목적에 한정하여 처리되며, 그 외의 목적으로 제3자에게 임의 제공되지 않습니다.</p>
        </div>
        <div>
          <p className="font-semibold mb-1">3. AI 서비스 제공을 위한 제3자 데이터 전송 고시</p>
          <p>본 서비스는 입력하신 자기소개서 및 면접 관련 텍스트 데이터를 AI 질문 및 문서 생성을 위해 Google Gemini API로 전송하여 처리합니다. 전송된 데이터는 AI 모델 학습에 활용되지 않으며, 토큰 기반 처리 후 즉시 파기됩니다.</p>
        </div>
      </div>
    ),
    refund: (
      <div>
        <p className="mb-2 text-red-600 font-semibold">디지털 콘텐츠 특성상 AI 생성이 시작된 이후에는 단순 변심에 의한 환불이 불가합니다.</p>
        <p>단, 서비스 시스템 오류로 인해 결제 후 질문이나 자소서가 정상적으로 생성되지 않은 경우, 고객센터(support@korean-resume-ai.com)로 문의해주시면 확인 후 100% 환불 처리해 드립니다.</p>
      </div>
    )
  };

  return (
    <footer className="w-full bg-white border-t border-gray-200 mt-auto">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-center md:text-left text-gray-500 text-sm leading-relaxed">
            <p className="font-semibold text-gray-700 mb-1">Korean Resume AI</p>
            <p>대표자 / 운영자: [운영자 성명 입력]</p>
            <p>문의 이메일: support@korean-resume-ai.com</p>
            <p>사업자 정보: [개인 개발 프로젝트 / 사업자등록번호 기재 영역]</p>
          </div>
          
          <div className="flex gap-4 text-sm text-gray-600 mt-4 md:mt-0">
            <button onClick={() => openModal("서비스 소개", policies.intro)} className="hover:text-blue-600 transition">서비스 소개</button>
            <button onClick={() => openModal("이용약관", policies.terms)} className="hover:text-blue-600 transition">이용약관</button>
            <button onClick={() => openModal("개인정보처리방침", policies.privacy)} className="hover:text-blue-600 transition">개인정보처리방침</button>
            <button onClick={() => openModal("환불정책", policies.refund)} className="hover:text-blue-600 transition font-medium">환불정책</button>
          </div>
        </div>
        
        <div className="mt-8 text-center text-xs text-gray-400">
          © {new Date().getFullYear()} Korean Resume AI. All rights reserved.
        </div>
      </div>

      <Modal isOpen={!!modalContent} onClose={closeModal} title={modalContent?.title || ""}>
        {modalContent?.content}
      </Modal>
    </footer>
  );
}
