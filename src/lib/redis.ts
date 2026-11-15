import { Redis } from "@upstash/redis";
import { getRedisCredentials, requireRedisCredentials } from "@/lib/redisConfig";

const FREE_RESERVE_LUA = `
local current = tonumber(redis.call("GET", KEYS[1]) or "0")
local maxReq = tonumber(ARGV[1])
local ttlSec = tonumber(ARGV[2])
if current >= maxReq then
  return {0, 0, current}
end
local updated = redis.call("INCR", KEYS[1])
if updated == 1 then
  redis.call("EXPIRE", KEYS[1], ttlSec)
end
local remaining = math.max(0, maxReq - updated)
return {1, remaining, updated}
`;

const FREE_REFUND_LUA = `
local current = tonumber(redis.call("GET", KEYS[1]) or "0")
local maxReq = tonumber(ARGV[1])
if current <= 0 then
  return {maxReq, 0}
end
local updated = redis.call("DECR", KEYS[1])
if updated <= 0 then
  redis.call("DEL", KEYS[1])
  return {maxReq, 0}
end
return {math.max(0, maxReq - updated), updated}
`;

export interface FreeRateLimitReservation {
  allowed: boolean;
  reserved: boolean;
  limit: number;
  remaining: number;
  used: number;
  refund: () => Promise<number | null>;
}

/**
 * 런타임 환경변수를 기반으로 Upstash Redis 클라이언트를 생성합니다.
 * 유료 결제 검증/차감 등 엄격한 상태 일관성이 필요한 경로에서 사용합니다.
 */
export function requireRedisClient(): Redis {
  const creds = requireRedisCredentials();
  return new Redis({
    url: creds.url,
    token: creds.token,
  });
}

function windowToSeconds(window: string): number {
  const m = window.trim().match(/^(\d+)\s*([smhd])$/i);
  if (!m) return 86_400;
  const val = Number(m[1]);
  const unit = m[2].toLowerCase();
  if (unit === "s") return val;
  if (unit === "m") return val * 60;
  if (unit === "h") return val * 3_600;
  return val * 86_400;
}

/**
 * 무료 체험(일일 IP 제한) 원자적 선점 + 실패 시 자동 횟수 복구(refund) 헬퍼
 * - 생성 시작 전 Redis Lua 스크립트로 남은 횟수를 확인/예약하고,
 *   Gemini 오류·타임아웃 등으로 생성이 실패할 경우 refund()를 호출해 무료 횟수를 원복합니다.
 * - Redis 미설정 또는 연결 장애 시 에러 로그만 남기고 통과(안전 폴백)합니다.
 */
export async function reserveFreeRateLimit(options: {
  key: string;
  maxRequests: number;
  window: string;
}): Promise<FreeRateLimitReservation> {
  const noopRefund = async () => null;
  try {
    const creds = getRedisCredentials();
    if (!creds) {
      console.error(
        `[RateLimit Fallback] Redis credentials missing. Allowing free request (key=${options.key}).`
      );
      return {
        allowed: true,
        reserved: false,
        limit: options.maxRequests,
        remaining: options.maxRequests,
        used: 0,
        refund: noopRefund,
      };
    }

    const redis = new Redis({
      url: creds.url,
      token: creds.token,
    });

    const ttlSeconds = windowToSeconds(options.window);
    const raw = (await redis.eval(
      FREE_RESERVE_LUA,
      [options.key],
      [String(options.maxRequests), String(ttlSeconds)]
    )) as [number | string, number | string, number | string] | null;

    const allowed = Number(raw?.[0] ?? 1) === 1;
    const remaining = Number(raw?.[1] ?? 0);
    const used = Number(raw?.[2] ?? 0);

    let alreadyRefunded = false;
    const refund = async (): Promise<number | null> => {
      if (!allowed || alreadyRefunded) {
        return remaining;
      }
      alreadyRefunded = true;
      try {
        const res = (await redis.eval(
          FREE_REFUND_LUA,
          [options.key],
          [String(options.maxRequests)]
        )) as [number | string, number | string] | null;
        return Number(res?.[0] ?? remaining);
      } catch (refundErr) {
        console.error(
          `[RateLimit Refund Error] Failed to restore free quota (key=${options.key}):`,
          refundErr
        );
        return null;
      }
    };

    return {
      allowed,
      reserved: allowed,
      limit: options.maxRequests,
      remaining,
      used,
      refund,
    };
  } catch (error) {
    console.error(
      `[RateLimit Fallback] Redis error during free-tier limit check (key=${options.key}). Allowing request:`,
      error
    );
    return {
      allowed: true,
      reserved: false,
      limit: options.maxRequests,
      remaining: options.maxRequests,
      used: 0,
      refund: noopRefund,
    };
  }
}

/**
 * 기존 호환 래퍼 (필요 시 단순 검사 용도)
 */
export async function checkFreeRateLimit(options: {
  key: string;
  maxRequests: number;
  window: string;
}): Promise<boolean> {
  const res = await reserveFreeRateLimit(options);
  return res.allowed;
}
