import { NextResponse } from "next/server";
import { sanitizeAnalyticsEventName } from "@/lib/analytics";
import { recordFunnelEventServer } from "@/lib/analyticsServer";

export const dynamic = "force-dynamic";

/**
 * 비식별 전환 퍼널 이벤트 수집 엔드포인트
 * - 허용 이벤트 8종 + source(blog/jobs/direct) + planType만 수락
 * - IP·이메일·본문 등 개인정보는 읽거나 저장하지 않습니다.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const validEvent = sanitizeAnalyticsEventName(body?.event);

    if (!validEvent) {
      return NextResponse.json(
        { error: "유효하지 않은 전환 이벤트입니다.", code: "INVALID_EVENT" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const result = await recordFunnelEventServer({
      event: validEvent,
      source: body?.source,
      planType: body?.planType,
    });

    return NextResponse.json(
      {
        ok: true,
        ...result,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { error: "이벤트 기록 중 오류가 발생했습니다." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }
}
