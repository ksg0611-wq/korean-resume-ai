import type { ReactNode } from "react";
import { POLICY_EFFECTIVE_DATE } from "@/lib/siteConfig";

/** /about /terms /privacy /refund 공통 서버 렌더링 레이아웃 */
export default function PolicyShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="flex-1 bg-gray-50 text-gray-900">
      <article className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">{title}</h1>
        <p className="text-xs text-gray-500 mb-8">{`시행일자: ${POLICY_EFFECTIVE_DATE}`}</p>
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 sm:p-8 text-sm leading-relaxed text-gray-700 space-y-6 break-keep">
          {children}
        </div>
      </article>
    </main>
  );
}

export function PolicySection({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="font-bold text-gray-900 mb-2 text-base">{heading}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
