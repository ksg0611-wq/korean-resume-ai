import { NextResponse, type NextRequest } from "next/server";
import { sanitizeErrorText } from "@/lib/alerts";
import { verifyAndGetStoredResult } from "@/lib/results";
import { BUSINESS_INFO } from "@/lib/siteConfig";

const RESULT_HTML_SECURITY_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
} as const;

function buildStatusHtml(options: {
  status: 403 | 410 | 500;
  title: string;
  heading: string;
  description: string;
}): string {
  const kakaoLink = BUSINESS_INFO.kakaoChannelUrl
    ? ` · <a href="${BUSINESS_INFO.kakaoChannelUrl}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:underline;">카카오톡 채널 문의</a>`
    : "";

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${options.title} | ${BUSINESS_INFO.serviceName}</title>
</head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;padding:16px;">
  <main style="max-width:460px;width:100%;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:32px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
    <div style="display:inline-block;padding:4px 10px;border-radius:9999px;font-size:12px;font-weight:700;background:${options.status === 410 ? "#fef3c7" : "#fee2e2"};color:${options.status === 410 ? "#92400e" : "#991b1b"};margin-bottom:14px;">
      HTTP ${options.status}
    </div>
    <h1 style="font-size:20px;font-weight:800;margin:0 0 10px 0;">${options.heading}</h1>
    <p style="font-size:14px;color:#4b5563;line-height:1.6;margin:0 0 24px 0;">${options.description}</p>
    <a href="/" style="display:inline-block;background:#2563eb;color:#ffffff;font-weight:700;font-size:14px;padding:10px 20px;border-radius:10px;text-decoration:none;">홈으로 돌아가기</a>
    <p style="margin-top:20px;font-size:12px;color:#6b7280;">
      문의: ${BUSINESS_INFO.email}${kakaoLink}
    </p>
  </main>
</body>
</html>`;
}

export async function middleware(req: NextRequest) {
  const segments = req.nextUrl.pathname.split("/").filter(Boolean);
  if (segments.length !== 2 || segments[0] !== "result") {
    return NextResponse.next();
  }

  let orderId = "";
  try {
    orderId = decodeURIComponent(segments[1]);
  } catch {
    return new NextResponse(
      buildStatusHtml({
        status: 403,
        title: "접근 불가",
        heading: "유효하지 않은 재열람 링크입니다.",
        description: "토큰이 누락되었거나 잘못된 링크입니다. 발급받으신 정확한 재열람 링크를 확인해 주세요.",
      }),
      {
        status: 403,
        headers: RESULT_HTML_SECURITY_HEADERS,
      }
    );
  }

  const token = req.nextUrl.searchParams.get("token");

  try {
    const outcome = await verifyAndGetStoredResult(orderId, token);

    if (outcome.status === 403) {
      return new NextResponse(
        buildStatusHtml({
          status: 403,
          title: "접근 권한 없음",
          heading: "유효하지 않은 재열람 토큰입니다.",
          description: "토큰이 일치하지 않거나 접근 권한이 없습니다. 결제 시 받으신 재열람 링크 전체 주소를 확인해 주세요.",
        }),
        {
          status: 403,
          headers: RESULT_HTML_SECURITY_HEADERS,
        }
      );
    }

    if (outcome.status === 410) {
      return new NextResponse(
        buildStatusHtml({
          status: 410,
          title: "열람 기간 만료",
          heading: "결과 재열람 기간(7일)이 만료되었습니다.",
          description: "개인정보 및 생성물 보호를 위해 결과물은 7일 보관 후 자동 파기됩니다. 이미 저장하신 .txt 파일을 확인하거나 새로 생성해 주세요.",
        }),
        {
          status: 410,
          headers: RESULT_HTML_SECURITY_HEADERS,
        }
      );
    }

    const response = NextResponse.next();
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  } catch (error) {
    console.error("[Middleware /result] Error checking token:", sanitizeErrorText(error));
    return new NextResponse(
      buildStatusHtml({
        status: 500,
        title: "일시적 오류",
        heading: "결과 조회 중 일시적인 오류가 발생했습니다.",
        description: "잠시 후 다시 시도해 주세요. 문제가 계속되면 고객센터로 문의해 주세요.",
      }),
      {
        status: 500,
        headers: RESULT_HTML_SECURITY_HEADERS,
      }
    );
  }
}

export const config = {
  matcher: ["/result/:path*"],
};
