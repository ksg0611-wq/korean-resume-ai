import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

export async function POST(req: Request) {
  try {
    const { paymentKey, orderId, amount } = await req.json();

    if (!paymentKey || !orderId || !amount) {
      return NextResponse.json({ message: "Bad Request" }, { status: 400 });
    }

    const secretKey = process.env.TOSS_SECRET_KEY || "test_sk_zXLkKEypNArWmo50nX3lmeaxYG5R";
    const encryptedSecretKey = Buffer.from(`${secretKey}:`).toString("base64");

    // 토스페이먼츠 승인 API 호출
    const response = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
      method: "POST",
      headers: {
        Authorization: `Basic ${encryptedSecretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        paymentKey,
        orderId,
        amount,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Toss Payments Confirm Error (Interview):", errorData);
      return NextResponse.json(
        { message: errorData.message || "결제 승인 실패" },
        { status: response.status }
      );
    }

    const paymentData = await response.json();

    // Redis에 인터뷰 꼬리질문 결제 정보 기록 (3회권)
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "",
      token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "",
    });

    await redis.set(`order:interview:${orderId}`, {
      paid: true,
      remainingGenerations: 3,
      verified: true
    });

    return NextResponse.json({ success: true, payment: paymentData });
  } catch (error) {
    console.error("Interview Payment Success Route Error:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
