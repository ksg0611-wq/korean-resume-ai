import { NextResponse } from "next/server";
import { verifyAndGetStoredResult } from "@/lib/results";
import { reportServerError } from "@/lib/alerts";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  context: { params: { orderId: string } }
) {
  const orderId = decodeURIComponent(context.params.orderId || "");
  const url = new URL(req.url);
  const token = url.searchParams.get("token") || req.headers.get("x-result-token");
  const format = url.searchParams.get("format");

  try {
    const outcome = await verifyAndGetStoredResult(orderId, token);

    if (outcome.status === 403) {
      return NextResponse.json(
        {
          error: "유효하지 않거나 잘못된 재열람 토큰입니다.",
          code: "FORBIDDEN",
          reason: outcome.reason,
        },
        {
          status: 403,
          headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
        }
      );
    }

    if (outcome.status === 410) {
      return NextResponse.json(
        {
          error: "결과 재열람 기간(7일)이 만료되어 파기되었습니다.",
          code: "GONE",
          orderId: outcome.orderId,
          expiredAt: outcome.expiredAt,
        },
        {
          status: 410,
          headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
        }
      );
    }

    const { result, order } = outcome;

    if (format === "txt") {
      const safeFilename = `${result.serviceType === "interview" ? "interview" : "resume"}_${result.orderId}.txt`;
      return new NextResponse(result.text, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="${safeFilename}"`,
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex, nofollow",
        },
      });
    }

    return NextResponse.json(
      {
        success: true,
        orderId: result.orderId,
        serviceType: result.serviceType,
        title: result.title,
        text: result.text,
        createdAt: result.createdAt,
        expiresAt: result.expiresAt,
        receiptUrl: result.receiptUrl ?? order.receiptUrl ?? null,
        remainingGenerations: order.remainingGenerations,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
      }
    );
  } catch (error) {
    console.error("[GET /api/result/[orderId]] Error:", error);
    await reportServerError({
      route: "/api/result/[orderId]",
      statusCode: 500,
      error,
      orderId,
    });
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
