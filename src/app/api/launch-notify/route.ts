import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { dbQuery } from "@/lib/db/client";
import { isAdminRequestAuthorized } from "@/lib/adminAuth";
import { requireRedisClient } from "@/lib/redis";
import {
  DDL_LAUNCH_NOTIFY_SIGNUPS,
  LAUNCH_NOTIFY_CONSENT_VERSION,
  validateLaunchNotifyBody,
} from "@/lib/launchNotify";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_SECONDS = 3_600;
const SUCCESS_MESSAGE = "신청되었습니다. 결제 기능이 열리면 이메일로 한 번 안내해 드릴게요.";

function clientIpHash(req: Request): string {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  // IP 원문은 저장하지 않고, 1시간 TTL 카운터 키에만 해시로 사용합니다.
  return createHash("sha256").update(ip).digest("hex").slice(0, 24);
}

/** 동일 IP 시간당 5회 제한. Redis 미설정·장애 시에는 통과(가입 흐름 우선). */
async function isRateLimited(req: Request): Promise<boolean> {
  try {
    const redis = requireRedisClient();
    const key = `ratelimit:launch_notify:${clientIpHash(req)}`;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, RATE_LIMIT_WINDOW_SECONDS);
    }
    return count > RATE_LIMIT_MAX;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const validation = validateLaunchNotifyBody(body);

  if ("honeypot" in validation) {
    return NextResponse.json({ success: true, message: SUCCESS_MESSAGE }, { headers: NO_STORE });
  }
  if (!validation.ok) {
    return NextResponse.json(
      { success: false, code: validation.code, message: validation.message },
      { status: validation.status, headers: NO_STORE }
    );
  }

  if (await isRateLimited(req)) {
    return NextResponse.json(
      { success: false, code: "RATE_LIMITED", message: "잠시 후 다시 시도해 주세요." },
      { status: 429, headers: NO_STORE }
    );
  }

  try {
    await dbQuery(DDL_LAUNCH_NOTIFY_SIGNUPS);
    await dbQuery(
      `INSERT INTO launch_notify_signups (email, source, marketing_consent, consent_version)
       VALUES ($1, $2, true, $3)
       ON CONFLICT (email) DO UPDATE
         SET marketing_consent = true,
             consent_version = EXCLUDED.consent_version,
             consented_at = now()`,
      [validation.email, validation.source, LAUNCH_NOTIFY_CONSENT_VERSION]
    );

    // 이메일은 런타임 로그에 남기지 않습니다.
    console.log(`[LaunchNotify] signup recorded (source=${validation.source})`);
    return NextResponse.json({ success: true, message: SUCCESS_MESSAGE }, { headers: NO_STORE });
  } catch (err: unknown) {
    console.error("[LaunchNotify] DB error:", err instanceof Error ? err.message : "unknown");
    return NextResponse.json(
      { success: false, code: "SERVER_ERROR", message: "신청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500, headers: NO_STORE }
    );
  }
}

/**
 * 관리자 전용 조회
 * - 기본: 신청 건수
 * - ?export=1: 오픈 안내 발송용 목록(이메일·동의 일시·동의 문구 버전, 미발송 건만)
 */
export async function GET(req: Request) {
  if (!isAdminRequestAuthorized(req)) {
    return NextResponse.json(
      { error: "Unauthorized", code: "ADMIN_AUTH_REQUIRED" },
      { status: 401, headers: NO_STORE }
    );
  }

  try {
    await dbQuery(DDL_LAUNCH_NOTIFY_SIGNUPS);
    const { searchParams } = new URL(req.url);

    if (searchParams.get("export") === "1") {
      const rows = await dbQuery<{
        email: string;
        source: string;
        consent_version: string;
        consented_at: string;
      }>(
        `SELECT email, source, consent_version, consented_at
           FROM launch_notify_signups
          WHERE marketing_consent = true AND notified_at IS NULL
          ORDER BY created_at ASC`
      );
      return NextResponse.json({ count: rows.length, rows }, { headers: NO_STORE });
    }

    const counts = await dbQuery<{ total: string; pending: string }>(
      `SELECT COUNT(*)::text AS total,
              COUNT(*) FILTER (WHERE notified_at IS NULL)::text AS pending
         FROM launch_notify_signups`
    );
    return NextResponse.json(
      {
        totalCount: parseInt(counts[0]?.total || "0", 10),
        pendingCount: parseInt(counts[0]?.pending || "0", 10),
      },
      { headers: NO_STORE }
    );
  } catch (err: unknown) {
    console.error("[LaunchNotify GET] DB error:", err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ message: "조회 중 오류가 발생했습니다." }, { status: 500, headers: NO_STORE });
  }
}
