/**
 * 5xx 오류 공통 알림 리포터
 *
 * - 결제 승인/취소 및 생성 API에서 5xx 장애가 발생하면 구조화된 에러 로그를 남기고,
 *   SENTRY_DSN 또는 ALERT_WEBHOOK_URL이 설정된 경우 즉시 외부 알림을 전송합니다.
 * - API 키, 시크릿 키, DB 접속 문자열 등은 전송·로깅 전에 마스킹합니다.
 */

const SECRET_ENV_KEYS = [
  "GEMINI_API_KEY",
  "TOSS_SECRET_KEY",
  "ADMIN_SECRET",
  "RESEND_API_KEY",
  "ALERT_WEBHOOK_URL",
  "SENTRY_DSN",
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_TOKEN",
  "DATABASE_URL",
  "DIRECT_URL",
] as const;

export function sanitizeErrorText(input: unknown): string {
  const raw =
    input instanceof Error
      ? `${input.name}: ${input.message}`
      : typeof input === "string"
        ? input
        : (() => {
            try {
              return JSON.stringify(input);
            } catch {
              return String(input);
            }
          })();

  let sanitized = raw
    .replace(/postgresql:\/\/([^:]+):([^@]+)@/gi, "postgresql://$1:****@")
    .replace(/postgres:\/\/([^:]+):([^@]+)@/gi, "postgres://$1:****@")
    .replace(/(Bearer|Basic)\s+[A-Za-z0-9\-._~+/]+=*/gi, "$1 ****")
    .replace(/([?&](?:key|apiKey|token|serviceKey|secret)=)[^&\s]+/gi, "$1****")
    .replace(/\b(?:AIza[0-9A-Za-z\-_]{20,}|re_[0-9A-Za-z_]{16,}|(?:test|live)_(?:sk|gsk|ck|gck)_[0-9A-Za-z_]{10,})\b/g, "[REDACTED_KEY]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[REDACTED_EMAIL]");

  for (const envKey of SECRET_ENV_KEYS) {
    const val = process.env[envKey]?.trim();
    if (val && val.length >= 6) {
      sanitized = sanitized.split(val).join(`[REDACTED_${envKey}]`);
    }
  }

  return sanitized.slice(0, 1000);
}

interface ParsedSentryDsn {
  storeUrl: string;
  publicKey: string;
}

function parseSentryDsn(dsn: string): ParsedSentryDsn | null {
  try {
    const parsed = new URL(dsn.trim());
    const publicKey = parsed.username;
    const projectId = parsed.pathname.replace(/^\/+/, "").split("/").pop();
    if (!publicKey || !projectId) {
      return null;
    }
    return {
      storeUrl: `${parsed.protocol}//${parsed.host}/api/${projectId}/store/`,
      publicKey,
    };
  } catch {
    return null;
  }
}

export interface ServerErrorReportContext {
  route: string;
  statusCode: number;
  error: unknown;
  orderId?: string | null;
  serviceType?: "resume" | "interview" | null;
  extra?: Record<string, unknown>;
}

export async function reportServerError(
  context: ServerErrorReportContext
): Promise<{ logged: true; sentryTriggered: boolean; webhookTriggered: boolean }> {
  const timestamp = new Date().toISOString();
  const safeMessage = sanitizeErrorText(context.error);
  const safeExtra = context.extra
    ? Object.fromEntries(
        Object.entries(context.extra).map(([k, v]) => [k, sanitizeErrorText(v)])
      )
    : undefined;

  const payload = {
    level: "error" as const,
    service: "korea-resume-ai",
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
    route: context.route,
    statusCode: context.statusCode,
    orderId: context.orderId ?? null,
    serviceType: context.serviceType ?? null,
    message: safeMessage,
    extra: safeExtra,
    timestamp,
  };

  console.error("[5XX_ALERT]", JSON.stringify(payload));

  let webhookTriggered = false;
  let sentryTriggered = false;

  const summaryText =
    `[Korea Resume AI 5xx Alert] ${payload.route} (${payload.statusCode})` +
    (payload.orderId ? ` | orderId=${payload.orderId}` : "") +
    ` | ${safeMessage}`;

  const tasks: Promise<void>[] = [];

  const webhookUrl = process.env.ALERT_WEBHOOK_URL?.trim();
  if (webhookUrl) {
    tasks.push(
      (async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2500);
        try {
          const res = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...payload,
              text: summaryText,
              content: summaryText,
            }),
            signal: controller.signal,
          });
          webhookTriggered = res.ok;
          if (!res.ok) {
            console.error(`[5XX_ALERT] Webhook responded with HTTP ${res.status}`);
          }
        } catch (err) {
          console.error("[5XX_ALERT] Webhook delivery failed:", sanitizeErrorText(err));
        } finally {
          clearTimeout(timer);
        }
      })()
    );
  }

  const sentryDsn = process.env.SENTRY_DSN?.trim();
  if (sentryDsn) {
    const parsed = parseSentryDsn(sentryDsn);
    if (parsed) {
      tasks.push(
        (async () => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 2500);
          try {
            const eventBody = {
              message: summaryText,
              level: "error",
              platform: "node",
              environment: payload.environment,
              timestamp: Math.floor(Date.now() / 1000),
              tags: {
                route: payload.route,
                status_code: String(payload.statusCode),
                ...(payload.serviceType ? { service_type: payload.serviceType } : {}),
              },
              extra: {
                orderId: payload.orderId,
                detail: safeMessage,
                ...safeExtra,
              },
            };

            const res = await fetch(parsed.storeUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=korea-resume-ai/1.0, sentry_key=${parsed.publicKey}`,
              },
              body: JSON.stringify(eventBody),
              signal: controller.signal,
            });
            sentryTriggered = res.ok;
            if (!res.ok) {
              console.error(`[5XX_ALERT] Sentry ingest responded with HTTP ${res.status}`);
            }
          } catch (err) {
            console.error("[5XX_ALERT] Sentry delivery failed:", sanitizeErrorText(err));
          } finally {
            clearTimeout(timer);
          }
        })()
      );
    } else {
      console.error("[5XX_ALERT] Invalid SENTRY_DSN format; skipped Sentry delivery.");
    }
  }

  await Promise.all(tasks);

  return {
    logged: true,
    sentryTriggered,
    webhookTriggered,
  };
}
