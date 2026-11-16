import { reportServerError, sanitizeErrorText } from "@/lib/alerts";

export const TOSS_TEST_SECRET_FALLBACK = "test_sk_zXLkKEypNArWmo50nX3lmeaxYG5R";

export function getTossSecretKey(): string {
  return process.env.TOSS_SECRET_KEY?.trim() || TOSS_TEST_SECRET_FALLBACK;
}

export function getTossAuthHeader(): string {
  const secretKey = getTossSecretKey();
  const encoded = Buffer.from(`${secretKey}:`).toString("base64");
  return `Basic ${encoded}`;
}

export interface TossConfirmResult {
  ok: boolean;
  status: number;
  data?: any;
  errorMessage?: string;
}

/**
 * 토스페이먼츠 결제 승인 API
 * POST https://api.tosspayments.com/v1/payments/confirm
 */
export async function confirmTossPayment(options: {
  paymentKey: string;
  orderId: string;
  amount: number | string;
  route: string;
}): Promise<TossConfirmResult> {
  const { paymentKey, orderId, amount, route } = options;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
        method: "POST",
        headers: {
          Authorization: getTossAuthHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paymentKey,
          orderId,
          amount,
        }),
        signal: controller.signal,
      });

      const data = await response.json().catch(() => null);

      if (response.ok) {
        return {
          ok: true,
          status: response.status,
          data,
        };
      }

      const errorMessage = data?.message || "결제 승인 실패";
      if (response.status >= 500) {
        await reportServerError({
          route,
          statusCode: response.status,
          error: errorMessage,
          orderId,
          extra: { stage: "toss_confirm", tossCode: data?.code },
        });
      }

      return {
        ok: false,
        status: response.status,
        data,
        errorMessage,
      };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    const safeMsg = sanitizeErrorText(err);
    await reportServerError({
      route,
      statusCode: 502,
      error: err,
      orderId,
      extra: { stage: "toss_confirm_network" },
    });
    return {
      ok: false,
      status: 502,
      errorMessage: safeMsg,
    };
  }
}

export interface TossCancelResult {
  ok: boolean;
  status: number;
  alreadyCanceled?: boolean;
  data?: any;
  errorMessage?: string;
}

/**
 * 토스페이먼츠 결제취소 API (전액 자동 환불)
 * POST https://api.tosspayments.com/v1/payments/{paymentKey}/cancel
 */
export async function cancelTossPayment(options: {
  paymentKey: string;
  cancelReason: string;
  orderId: string;
  route?: string;
  timeoutMs?: number;
}): Promise<TossCancelResult> {
  const {
    paymentKey,
    cancelReason,
    orderId,
    route = "/api/generate",
    timeoutMs = 8000,
  } = options;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(
        `https://api.tosspayments.com/v1/payments/${encodeURIComponent(paymentKey)}/cancel`,
        {
          method: "POST",
          headers: {
            Authorization: getTossAuthHeader(),
            "Content-Type": "application/json",
            "Idempotency-Key": `auto_refund_${orderId}`,
          },
          body: JSON.stringify({
            cancelReason,
          }),
          signal: controller.signal,
        }
      );

      const data = await response.json().catch(() => null);

      if (response.ok) {
        return {
          ok: true,
          status: response.status,
          data,
        };
      }

      if (data?.code === "ALREADY_CANCELED_PAYMENT") {
        return {
          ok: true,
          status: response.status,
          alreadyCanceled: true,
          data,
        };
      }

      const errorMessage = data?.message || `Toss cancel failed (HTTP ${response.status})`;
      if (response.status >= 500) {
        await reportServerError({
          route,
          statusCode: response.status,
          error: errorMessage,
          orderId,
          extra: { stage: "toss_cancel", tossCode: data?.code },
        });
      }

      return {
        ok: false,
        status: response.status,
        data,
        errorMessage,
      };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    const safeMsg = sanitizeErrorText(err);
    await reportServerError({
      route,
      statusCode: 502,
      error: err,
      orderId,
      extra: { stage: "toss_cancel_network" },
    });
    return {
      ok: false,
      status: 502,
      errorMessage: safeMsg,
    };
  }
}
