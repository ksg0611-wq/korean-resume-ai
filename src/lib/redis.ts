import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { getRedisCredentials, requireRedisCredentials } from "@/lib/redisConfig";

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

/**
 * 무료 체험 요청(isFree: true)에 대한 IP 기반 Rate Limit을 검사합니다.
 * Redis 미설정, 연결 장애, 일시적 비활성화 시 에러 로그만 남기고 true를 반환해
 * 무료 체험 기능이 전면 500 장애로 마비되지 않도록 안전하게 폴백합니다.
 */
export async function checkFreeRateLimit(options: {
  key: string;
  maxRequests: number;
  window: Parameters<typeof Ratelimit.slidingWindow>[1];
}): Promise<boolean> {
  try {
    const creds = getRedisCredentials();
    if (!creds) {
      console.error(
        `[RateLimit Fallback] Redis credentials missing. Allowing free request (key=${options.key}).`
      );
      return true;
    }

    const redis = new Redis({
      url: creds.url,
      token: creds.token,
    });

    const ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(options.maxRequests, options.window),
    });

    const { success } = await ratelimit.limit(options.key);
    return success;
  } catch (error) {
    console.error(
      `[RateLimit Fallback] Redis error during free-tier limit check (key=${options.key}). Allowing request:`,
      error
    );
    return true;
  }
}
