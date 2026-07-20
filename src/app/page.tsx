"use client";

import { useState, useEffect } from "react";

export default function Home() {
  const [resumePrompt, setResumePrompt] = useState("");
  const [agreedToRefundPolicy, setAgreedToRefundPolicy] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [orderId, setOrderId] = useState("");

  useEffect(() => {
    const savedDraft = localStorage.getItem("resumeDraft");
    if (savedDraft) {
      setResumePrompt(savedDraft);
    }
  }, []);

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setResumePrompt(e.target.value);
    localStorage.setItem("resumeDraft", e.target.value);
  };

  const handlePaymentAndGenerate = async () => {
    if (!agreedToRefundPolicy) return;
    
    setIsGenerating(true);
    setError("");
    setResult("");

    try {
      // In a real app, Toss Payments Widget would be called here to get an orderId after successful payment.
      // For this implementation, we will use the provided orderId or simulate one for testing.
      // The API endpoint handles both free generation (no orderId) and paid generation (with valid orderId).
      
      const payload: any = { prompt: resumePrompt };
      if (orderId.trim() !== "") {
        payload.orderId = orderId;
      }

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        if (res.status === 429) {
          throw new Error("무료 이용 횟수(3회)를 초과했습니다. 결제가 필요합니다.");
        }
        if (res.status === 403) {
          throw new Error("유효하지 않은 결제 정보이거나 생성 횟수가 소진되었습니다.");
        }
        throw new Error("생성 중 오류가 발생했습니다.");
      }

      const data = await res.json();
      setResult(data.text);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center p-8 sm:p-24 bg-gray-50 text-gray-900">
      <div className="max-w-2xl w-full flex flex-col gap-8">
        <header className="text-center">
          <h1 className="text-4xl font-bold mb-4">Korean Resume AI Tool</h1>
          <p className="text-lg text-gray-600">
            STAR 프레임워크와 직무별 키워드 매핑 로직을 적용해 완벽한 자소서 초안을 만듭니다.
          </p>
        </header>

        <section className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            자기소개서 작성 내용 (상황, 과제, 행동, 결과를 자유롭게 작성해주세요)
          </label>
          <textarea
            className="w-full h-48 p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
            placeholder="예: 마케팅 인턴으로 근무하며..."
            value={resumePrompt}
            onChange={handlePromptChange}
          ></textarea>
        </section>

        <section className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 flex flex-col gap-4">
          <h2 className="text-xl font-semibold">결제 및 생성</h2>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              테스트용 Order ID (유료 결제 시 입력)
            </label>
            <input
              type="text"
              className="w-full p-2 border border-gray-300 rounded-md outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="orderId를 입력하세요 (비워두면 무료 호출 테스트)"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
            />
          </div>

          <label className="flex items-start gap-3 cursor-pointer p-3 bg-gray-50 border border-gray-200 rounded-md">
            <input
              type="checkbox"
              className="mt-1 w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              checked={agreedToRefundPolicy}
              onChange={(e) => setAgreedToRefundPolicy(e.target.checked)}
            />
            <span className="text-sm text-gray-700">
              결제 완료 시 즉시 AI 생성이 시작되는 디지털 콘텐츠 특성상, 생성 시작 후 단순 변심에 의한 환불이 불가함에 동의합니다.
            </span>
          </label>

          <button
            onClick={handlePaymentAndGenerate}
            disabled={!agreedToRefundPolicy || isGenerating || !resumePrompt.trim()}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium rounded-md shadow-sm transition"
          >
            {isGenerating ? "AI 자소서 생성 중..." : "결제 및 AI 자소서 생성하기"}
          </button>

          {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded-md text-sm border border-red-200">
              {error}
            </div>
          )}
        </section>

        {result && (
          <section className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h2 className="text-xl font-semibold mb-4">생성된 자기소개서</h2>
            <div className="whitespace-pre-wrap bg-gray-50 p-4 rounded-md border border-gray-100 text-sm leading-relaxed">
              {result}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
