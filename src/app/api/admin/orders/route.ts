import { NextResponse } from "next/server";
import {
  getConfiguredAdminSecret,
  isAdminRequestAuthorized,
  isLivePaymentEnabled,
  isPaymentLockMode,
} from "@/lib/adminAuth";
import {
  isOrderMismatch,
  isOrderStuck,
  listAdminOrders,
  type AdminOrderFilter,
} from "@/lib/orders";
import { reportServerError } from "@/lib/alerts";
import { getDailyFreeMetricsSummary } from "@/lib/freeMetrics";
import { getDailyFunnelSummary } from "@/lib/analyticsServer";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const configuredSecret = getConfiguredAdminSecret();
  if (!configuredSecret) {
    return NextResponse.json(
      { error: "ADMIN_SECRET is not configured on the server." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (!isAdminRequestAuthorized(req)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const url = new URL(req.url);
    const rawFilter = url.searchParams.get("filter") || "all";
    const filter: AdminOrderFilter =
      rawFilter === "mismatch" ||
      rawFilter === "stuck" ||
      rawFilter === "refunded" ||
      rawFilter === "done"
        ? rawFilter
        : "all";
    const limitParam = Number(url.searchParams.get("limit") || "100");
    const limit = Number.isFinite(limitParam) ? limitParam : 100;
    const orderId = url.searchParams.get("orderId");
    const analyticsDate = url.searchParams.get("analyticsDate");

    const [data, freeMetrics, analyticsFunnel] = await Promise.all([
      listAdminOrders({ filter, limit, orderId }),
      getDailyFreeMetricsSummary(),
      getDailyFunnelSummary(analyticsDate),
    ]);
    const nowMs = Date.now();

    return NextResponse.json(
      {
        success: true,
        filter,
        livePaymentEnabled: isLivePaymentEnabled(),
        testPaymentMode: isPaymentLockMode(),
        freeMetrics,
        analyticsFunnel,
        summary: data.summary,
        orders: data.orders.map((order) => ({
          ...order,
          isMismatch: isOrderMismatch(order),
          isStuck: isOrderStuck(order, nowMs),
        })),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex, nofollow",
        },
      }
    );
  } catch (error) {
    console.error("[GET /api/admin/orders] Error:", error);
    await reportServerError({
      route: "/api/admin/orders",
      statusCode: 500,
      error,
    });
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
