import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

export async function GET() {
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "https://dummy-url.upstash.io",
    token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "dummy-token",
  });

  await redis.flushdb();
  
  return NextResponse.json({ success: true, message: "Database flushed" });
}
