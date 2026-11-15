import { NextResponse } from "next/server";
import { PAID_GENERATIONS, PAID_ORDER_TTL_SECONDS } from "@/lib/policy";
import { requireRedisClient } from "@/lib/redis";

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

    // Redis에 인터뷰 꼬리질문 결제 정보 기록 (3회권, 1년 TTL)
    const redis = requireRedisClient();

    await redis.set(
      `order:interview:${orderId}`,
      {
        paid: true,
        remainingGenerations: PAID_GENERATIONS,
        verified: true,
      },
      { ex: PAID_ORDER_TTL_SECONDS }
    );

    return NextResponse.json({ success: true, payment: paymentData });
  } catch (error) {
    console.error("Interview Payment Success Route Error:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
