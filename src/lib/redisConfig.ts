export interface RedisCredentials {
  url: string;
  token: string;
}

export function getRedisCredentials(): RedisCredentials | null {
  const url =
    process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    "";

  if (!url || !token) {
    return null;
  }

  return { url, token };
}

export function requireRedisCredentials(): RedisCredentials {
  const creds = getRedisCredentials();
  if (!creds) {
    throw new Error("Upstash Redis environment variables are missing.");
  }
  return creds;
}
