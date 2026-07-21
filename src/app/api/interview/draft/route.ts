import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import crypto from "crypto";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "",
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "",
});

export async function POST(req: Request) {
  try {
    const { resumeText } = await req.json();

    if (!resumeText) {
      return NextResponse.json({ message: "resumeText is required" }, { status: 400 });
    }

    const token = crypto.randomUUID();
    const key = `draft:${token}`;

    // TTL 600s (10 minutes)
    await redis.set(key, resumeText, { ex: 600 });

    return NextResponse.json({ success: true, token });
  } catch (error) {
    console.error("Interview Draft POST Error:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return NextResponse.json({ message: "token is required" }, { status: 400 });
    }

    const key = `draft:${token}`;

    // Get the text and immediately delete the key (Burn-on-read)
    // Upstash Redis SDK returns the value as string or object.
    const resumeText: string | null = await redis.get(key);

    if (!resumeText) {
      return NextResponse.json(
        { message: "유효하지 않거나 이미 만료된 토큰입니다." },
        { status: 404 }
      );
    }

    await redis.del(key);

    return NextResponse.json({ success: true, resumeText });
  } catch (error) {
    console.error("Interview Draft GET Error:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
