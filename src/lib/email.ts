import { BUSINESS_INFO, SITE_URL } from "@/lib/siteConfig";
import { AI_DRAFT_REVIEW_NOTICE, RESULT_TTL_DAYS } from "@/lib/policy";
import { reportServerError, sanitizeErrorText } from "@/lib/alerts";
import type { ServiceType } from "@/lib/results";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatKstDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export interface SendResultEmailOutcome {
  sent: boolean;
  skipped?: boolean;
  id?: string;
  error?: string;
}

/**
 * 생성 완료 결과 재열람 링크(7일 유효) + 토스 영수증 안내 이메일 발송
 * - RESEND_API_KEY가 미설정이면 에러 없이 안내 로그만 남기고 통과합니다.
 */
export async function sendResultEmail(options: {
  to: string | null | undefined;
  orderId: string;
  serviceType: ServiceType;
  resultUrl: string;
  expiresAt: string;
  receiptUrl?: string | null;
}): Promise<SendResultEmailOutcome> {
  const { to, orderId, serviceType, resultUrl, expiresAt, receiptUrl } = options;

  if (!to) {
    return { sent: false, skipped: true };
  }

  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  if (!resendApiKey) {
    console.info(
      `[Email] RESEND_API_KEY is not configured. Skipping result email notification (orderId=${orderId}).`
    );
    return { sent: false, skipped: true };
  }

  const fromEmail =
    process.env.RESEND_FROM_EMAIL?.trim() || "Korea Resume AI <no-reply@korea-resume.com>";
  const fullResultUrl = resultUrl.startsWith("http")
    ? resultUrl
    : `${SITE_URL}${resultUrl}`;
  const serviceLabel =
    serviceType === "interview"
      ? "AI 공공기관 면접 시뮬레이터 대비 노트"
      : "AI 자기소개서 초안";
  const expiresKst = formatKstDateTime(expiresAt);

  const safeOrderId = escapeHtml(orderId);
  const safeResultUrl = escapeHtml(fullResultUrl);
  const safeExpiresKst = escapeHtml(expiresKst);
  const safeReceiptUrl =
    receiptUrl && receiptUrl.startsWith("https://") ? escapeHtml(receiptUrl) : null;
  const safeKakaoUrl =
    BUSINESS_INFO.kakaoChannelUrl && BUSINESS_INFO.kakaoChannelUrl.startsWith("http")
      ? escapeHtml(BUSINESS_INFO.kakaoChannelUrl)
      : null;

  const subject = `[${BUSINESS_INFO.serviceName}] ${serviceLabel} 재열람 링크(${RESULT_TTL_DAYS}일 유효) 및 결제 영수증 안내`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937; line-height: 1.6;">
      <h2 style="color: #1d4ed8; margin-bottom: 12px;">${BUSINESS_INFO.serviceName} 생성 완료 안내</h2>
      <p>결제하신 <strong>${escapeHtml(serviceLabel)}</strong> 생성이 완료되었습니다.</p>
      <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 10px 14px; margin: 12px 0; font-size: 13px; color: #92400e;">
        ※ 안내: ${escapeHtml(AI_DRAFT_REVIEW_NOTICE)}
      </div>
      <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 16px; margin: 16px 0;">
        <p style="margin: 0 0 8px 0; font-weight: bold; color: #1e3a8a;">${RESULT_TTL_DAYS}일간 열람 가능하니 링크를 저장하세요</p>
        <p style="margin: 0 0 12px 0; font-size: 13px; color: #475569;">주문번호: <code>${safeOrderId}</code> · 열람 만료: ${safeExpiresKst} (KST)</p>
        <a href="${safeResultUrl}" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; font-weight: bold; padding: 10px 18px; border-radius: 8px;">생성 결과 다시 보기 (.txt 다운로드)</a>
        <p style="margin: 12px 0 0 0; font-size: 12px; word-break: break-all; color: #4b5563;">링크: <a href="${safeResultUrl}">${safeResultUrl}</a></p>
      </div>
      <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px; margin: 16px 0; font-size: 13px;">
        <p style="margin: 0 0 6px 0; font-weight: bold;">토스페이먼츠 영수증 · 현금영수증 안내</p>
        ${
          safeReceiptUrl
            ? `<p style="margin: 0 0 6px 0;"><a href="${safeReceiptUrl}" style="color: #2563eb;">토스페이먼츠 영수증(매출전표) 확인하기</a></p>`
            : `<p style="margin: 0 0 6px 0;">토스페이먼츠 결제 영수증 및 현금영수증은 주문번호(${safeOrderId})로 문의하시면 안내해 드립니다.</p>`
        }
        <p style="margin: 0; color: #6b7280;">현금영수증을 신청하신 경우 위 영수증 화면 또는 국세청 홈택스(hometax.go.kr)에서 조회하실 수 있습니다.</p>
      </div>
      <p style="font-size: 12px; color: #6b7280;">
        문의: ${escapeHtml(BUSINESS_INFO.email)}${safeKakaoUrl ? ` · <a href="${safeKakaoUrl}" style="color: #2563eb;">카카오톡 채널 문의하기</a>` : ""}
      </p>
    </div>
  `.trim();

  const text = [
    `[${BUSINESS_INFO.serviceName}] ${serviceLabel} 생성 완료 안내`,
    `※ 안내: ${AI_DRAFT_REVIEW_NOTICE}`,
    `주문번호: ${orderId}`,
    `${RESULT_TTL_DAYS}일간 열람 가능하니 링크를 저장하세요 (만료: ${expiresKst} KST)`,
    `재열람 링크: ${fullResultUrl}`,
    receiptUrl ? `토스페이먼츠 영수증: ${receiptUrl}` : "",
    `문의 이메일: ${BUSINESS_INFO.email}`,
    BUSINESS_INFO.kakaoChannelUrl ? `카카오톡 채널: ${BUSINESS_INFO.kakaoChannelUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject,
        html,
        text,
      }),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const msg = data?.message || `Resend HTTP ${response.status}`;
      await reportServerError({
        route: "lib/email/sendResultEmail",
        statusCode: response.status >= 500 ? response.status : 500,
        error: msg,
        orderId,
        serviceType,
      });
      return { sent: false, error: msg };
    }

    return { sent: true, id: data?.id };
  } catch (err) {
    const safeMsg = sanitizeErrorText(err);
    await reportServerError({
      route: "lib/email/sendResultEmail",
      statusCode: 502,
      error: err,
      orderId,
      serviceType,
    });
    return { sent: false, error: safeMsg };
  } finally {
    clearTimeout(timer);
  }
}
