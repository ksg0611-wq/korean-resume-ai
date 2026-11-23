"use client";

import PreviewCard from "@/components/PreviewCard";
import { FREE_LIMITS, PAID_GENERATIONS, PRICING_PLANS, RESULT_TTL_DAYS } from "@/lib/policy";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

type StartHandler = (mode?: "diagnose" | "draft") => void;

function SectionHeading({ eyebrow, title, sub }: { eyebrow: string; title: React.ReactNode; sub?: string }) {
  return (
    <div className="flex flex-col items-center text-center gap-3">
      <p className="text-sm sm:text-[15px] font-bold text-blue-600">{eyebrow}</p>
      <h2 className="text-[26px] sm:text-4xl font-extrabold text-gray-900 leading-[1.3]">{title}</h2>
      {sub && <p className="text-sm sm:text-base text-gray-500">{sub}</p>}
    </div>
  );
}

/* ───────────────────────── 히어로 오른쪽: 진단 리포트 예시 카드 ───────────────────────── */

const RUBRIC_EXAMPLE = [
  { label: "STAR 구조", score: 22, max: 30, warn: false },
  { label: "수치 구체성", score: 9, max: 30, warn: true },
  { label: "블라인드 규정", score: 20, max: 20, warn: false },
  { label: "분량", score: 13, max: 20, warn: false },
];

export function HeroReportCard() {
  const total = RUBRIC_EXAMPLE.reduce((s, r) => s + r.score, 0);
  return (
    <div className="w-full max-w-[480px] mx-auto bg-white rounded-[28px] p-5 sm:p-7 shadow-[0_30px_60px_-20px_rgba(15,23,42,0.18)] ring-1 ring-gray-900/5 flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs sm:text-[13px] text-gray-500 font-medium">자소서 진단 리포트 · 예시 화면</span>
          <span className="text-base sm:text-[17px] font-bold text-gray-900">2번 문항 · 직무역량</span>
        </div>
        <span className="shrink-0 text-xs font-semibold text-amber-800 bg-amber-100 px-2.5 py-1 rounded-full">보완 필요</span>
      </div>

      <div className="flex items-center gap-5">
        <div
          className="w-24 h-24 sm:w-28 sm:h-28 rounded-full flex items-center justify-center shrink-0"
          style={{ background: `conic-gradient(#2563eb 0 ${total}%, #e2e8f0 ${total}% 100%)` }}
          role="img"
          aria-label={`예시 점수 ${total}점 / 100점`}
        >
          <div className="w-[76px] h-[76px] sm:w-[88px] sm:h-[88px] rounded-full bg-white flex flex-col items-center justify-center">
            <span className="text-2xl sm:text-3xl font-extrabold text-gray-900">{total}</span>
            <span className="text-[11px] sm:text-xs text-gray-500">/ 100점</span>
          </div>
        </div>
        <ul className="flex-1 min-w-0 flex flex-col gap-2.5">
          {RUBRIC_EXAMPLE.map((r) => (
            <li key={r.label} className="flex flex-col gap-1">
              <div className="flex justify-between text-xs sm:text-[13px]">
                <span className="text-gray-700">{r.label}</span>
                <span className="font-semibold text-gray-900">
                  {r.score} / {r.max}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-200">
                <div
                  className={`h-1.5 rounded-full ${r.warn ? "bg-amber-500" : "bg-blue-600"}`}
                  style={{ width: `${Math.round((r.score / r.max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl bg-gray-50 p-4 sm:p-5 flex flex-col gap-2">
        <span className="text-xs sm:text-[13px] font-bold text-amber-700">가장 큰 감점 요인</span>
        <p className="text-sm sm:text-[15px] leading-relaxed text-gray-700">
          “좋은 결과를 만들었습니다”처럼 성과가 숫자 없이 끝납니다.
        </p>
        <p className="text-sm sm:text-[15px] leading-relaxed text-gray-900 font-medium">
          → 결제 완료율이{" "}
          <mark className="bg-amber-100 text-amber-900 rounded px-1">[본인 수치]</mark> 올랐습니다
        </p>
      </div>
    </div>
  );
}

/* ───────────────────────── 신뢰 지표 줄 ───────────────────────── */

export function TrustBar() {
  const items = [
    { title: "4개 항목 · 100점", sub: "채점 기준을 공개합니다" },
    { title: "공고 맞춤", sub: "공공기관 채용공고 연동" },
    { title: "원문 미저장", sub: "AI 처리 후 서버에 남기지 않음" },
    { title: "구독 없음", sub: "필요할 때 1회 결제" },
  ];
  return (
    <section aria-label="서비스 특징" className="bg-slate-900 rounded-3xl px-5 py-6 sm:px-8 sm:py-7">
      <ul className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-5">
        {items.map((it) => (
          <li key={it.title} className="flex flex-col gap-1">
            <span className="text-base sm:text-xl font-extrabold text-white">{it.title}</span>
            <span className="text-xs sm:text-sm text-slate-400">{it.sub}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ───────────────────────── 이용 방법 3단계 ───────────────────────── */

export function HowItWorks() {
  const steps = [
    {
      title: "붙여넣기",
      body: "이미 쓴 자소서를 붙여넣거나, 경험 메모만 적어도 됩니다. 지원할 공고를 고르면 기관에 맞춰 봅니다.",
    },
    {
      title: "무료 채점",
      body: "100점 기준 점수와 가장 큰 감점 요인, 고친 문장 예시를 바로 확인합니다.",
    },
    {
      title: "완성본과 면접 준비",
      body: "필요할 때만 결제해 4문항 완성본과 내 자소서 기반 예상 면접 질문을 받습니다.",
    },
  ];
  return (
    <section id="how" className="scroll-mt-20 flex flex-col gap-8 py-4 sm:py-8">
      <SectionHeading eyebrow="이용 방법" title="3단계면 제출할 수 있는 자소서가 됩니다" />
      <ol className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
        {steps.map((s, i) => (
          <li key={s.title} className="bg-white rounded-3xl p-6 sm:p-7 flex flex-col gap-3 ring-1 ring-gray-900/5">
            <span className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 font-extrabold flex items-center justify-center">
              {i + 1}
            </span>
            <h3 className="text-lg sm:text-xl font-bold text-gray-900">{s.title}</h3>
            <p className="text-[15px] sm:text-base leading-relaxed text-gray-600">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ───────────────────────── 교정 전/후 쇼케이스 ───────────────────────── */

export function ShowcaseSection() {
  return (
    <section id="sample-showcase" className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-14 items-center py-4 sm:py-8">
      <div className="flex flex-col gap-4">
        <p className="text-sm sm:text-[15px] font-bold text-blue-600">교정 전과 후</p>
        <h2 className="text-[26px] sm:text-4xl font-extrabold text-gray-900 leading-[1.3]">
          평범한 문장이
          <br />
          근거 있는 문장으로
        </h2>
        <p className="text-base sm:text-[17px] leading-relaxed text-gray-600">
          STAR 구조로 다시 쓰되, 경험에 없는 수치나 자격증은 지어내지 않습니다. 숫자가 필요한 자리는 비워 두고 직접
          채우도록 알려 드립니다.
        </p>
      </div>
      <PreviewCard />
    </section>
  );
}

/* ───────────────────────── 가격 ───────────────────────── */

export function PricingCards({ onStart }: { onStart: StartHandler }) {
  const plans = [
    {
      name: "무료 진단",
      price: "0원",
      features: [
        "100점 채점과 항목별 점수",
        "가장 큰 감점 요인과 고친 문장 예시",
        "메모로 쓰면 1문항 미리보기",
        `하루 ${FREE_LIMITS.resume}회`,
      ],
      cta: "무료로 시작",
      featured: false,
    },
    {
      name: "공고 지원 패키지",
      price: won(PRICING_PLANS.resume_single.price),
      features: [
        "자소서 4문항 완성본 (약 2,000자)",
        "내 자소서 기반 예상 면접 질문 10선",
        `총 ${PAID_GENERATIONS}회 생성 (재생성 ${PAID_GENERATIONS - 1}회 포함)`,
        `${RESULT_TTL_DAYS}일 재열람 링크`,
      ],
      cta: "완성본 받기",
      featured: true,
    },
    {
      name: "서류 + 면접 통합",
      price: won(PRICING_PLANS.bundle.price),
      features: [
        "공고 지원 패키지 전체",
        "AI 면접 시뮬레이터 15문항과 꼬리질문",
        "답변 채점과 1분 자기소개 대본",
        `${won(PRICING_PLANS.resume_single.price)} 구매 후 +${won(PRICING_PLANS.interview_upgrade.price)} 추가도 가능`,
      ],
      cta: "통합으로 준비하기",
      featured: false,
    },
  ];

  return (
    <section id="pricing" className="scroll-mt-20 flex flex-col gap-8 py-4 sm:py-8">
      <SectionHeading
        eyebrow="가격"
        title="진단은 무료, 완성본은 필요할 때만"
        sub="구독 없이 1회 결제 · 첫 생성에 실패하면 자동 전액 환불"
      />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5 items-stretch">
        {plans.map((p) => (
          <div
            key={p.name}
            className={`relative rounded-3xl p-6 sm:p-8 flex flex-col gap-5 ${
              p.featured ? "bg-slate-900 text-white" : "bg-white text-gray-900 ring-1 ring-gray-200"
            }`}
          >
            {p.featured && (
              <span className="absolute top-5 right-5 text-xs font-bold bg-blue-600 text-white px-2.5 py-1 rounded-full">
                추천
              </span>
            )}
            <div className="flex flex-col gap-1.5">
              <h3 className="text-base sm:text-[17px] font-bold">{p.name}</h3>
              <span className="text-4xl font-extrabold">{p.price}</span>
            </div>
            <ul className={`flex-1 flex flex-col gap-2.5 text-[15px] ${p.featured ? "text-slate-300" : "text-gray-700"}`}>
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <svg
                    className={`w-4 h-4 mt-1 shrink-0 ${p.featured ? "text-blue-400" : "text-blue-600"}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => onStart("diagnose")}
              className={`min-h-[52px] rounded-2xl font-bold transition-colors cursor-pointer ${
                p.featured ? "bg-blue-600 hover:bg-blue-500 text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-900"
              }`}
            >
              {p.cta}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ───────────────────────── 안심 포인트 ───────────────────────── */

export function SafetyPoints() {
  const points = [
    {
      title: "원문을 저장하지 않습니다",
      body: "입력한 자소서는 AI 처리에만 쓰고 서버에 남기지 않습니다.",
      icon: <path d="M7 11V7a5 5 0 0110 0v4M5 11h14v10H5z" />,
    },
    {
      title: "수치를 지어내지 않습니다",
      body: "경험에 없는 숫자와 자격증은 빈칸으로 남겨 면접에서 곤란하지 않게 합니다.",
      icon: <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6zM9 12l2 2 4-4" />,
    },
    {
      title: "실패하면 자동 환불",
      body: "결제 후 첫 결과물이 만들어지지 않으면 전액 자동으로 돌려드립니다.",
      icon: <path d="M3 12a9 9 0 0115.5-6.3L21 8M21 3v5h-5M21 12a9 9 0 01-15.5 6.3L3 16M3 21v-5h5" />,
    },
    {
      title: "토스페이먼츠 결제",
      body: "카드 정보는 결제사가 처리하며 저희는 받지 않습니다.",
      icon: <path d="M3 6h18v13H3zM3 10h18" />,
    },
  ];
  return (
    <section aria-label="안심하고 쓰는 이유" className="bg-white rounded-3xl p-6 sm:p-10 ring-1 ring-gray-900/5">
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-7">
        {points.map((p) => (
          <li key={p.title} className="flex flex-col gap-2.5">
            <svg
              className="w-7 h-7 text-gray-900"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {p.icon}
            </svg>
            <h3 className="text-[17px] font-bold text-gray-900">{p.title}</h3>
            <p className="text-[15px] leading-relaxed text-gray-600">{p.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ───────────────────────── 마지막 행동 유도 ───────────────────────── */

export function FinalCta({ onStart }: { onStart: StartHandler }) {
  return (
    <section className="bg-slate-900 rounded-[32px] px-6 py-14 sm:py-16 flex flex-col items-center text-center gap-4">
      <h2 className="text-[26px] sm:text-[40px] font-extrabold text-white leading-[1.3]">지금 쓴 자소서, 몇 점일까요?</h2>
      <p className="text-base sm:text-[17px] text-slate-400">회원가입 없이 바로 확인할 수 있습니다.</p>
      <button
        type="button"
        onClick={() => onStart("diagnose")}
        className="mt-2 min-h-[56px] px-8 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-base sm:text-lg font-bold transition-colors cursor-pointer"
      >
        무료로 진단받기
      </button>
    </section>
  );
}
