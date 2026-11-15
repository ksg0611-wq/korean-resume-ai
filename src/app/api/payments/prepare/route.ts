import { NextResponse } from "next/server";
import { linkOrderPreviewToken } from "@/lib/orders";
import { reportServerError } from "@/lib/alerts";

/**
 * 결제 창 호출 직전 orderId <-> previewToken 매핑 저장 및 preview TTL(7,200초) 연장
 */
export async function POST(req: Request) {
  let orderIdForLog: string | null = null;
  try {
    const body = await req.json();
    const orderId = typeof body?.orderId === "string" ? body.orderId.trim() : "";
    const previewToken =
      typeof body?.previewToken === "string" ? body.previewToken.trim() : "";
    orderIdForLog = orderId || null;

    if (!orderId) {
      return NextResponse.json({ error: "orderId is required" }, { status: 400 });
    }

    if (!previewToken) {
      return NextResponse.json({
        linked: false,
        previewExists: false,
        expiresAt: null,
      });
    }

    const outcome = await linkOrderPreviewToken({ orderId, previewToken });
    return NextResponse.json(outcome);
  } catch (error) {
    console.error("[/api/payments/prepare] Error:", error);
    await reportServerError({
      route: "/api/payments/prepare",
      statusCode: 500,
      error,
      orderId: orderIdForLog,
    });
    // 준비 매핑 실패 시에도 결제 흐름 자체를 차단하지 않고 Branch B 폴백 가능하도록 안전 응답
    return NextResponse.json({
      linked: false,
      previewExists: false,
      expiresAt: null,
      warning: "preview_link_failed",
    });
  }
}
