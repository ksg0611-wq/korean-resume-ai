import { NextResponse } from "next/server";
import { timingSafeEqualStrings } from "@/lib/results";
import {
  isOrderMismatch,
  isOrderStuck,
  listAdminOrders,
  type AdminOrderFilter,
} from "@/lib/orders";
import { reportServerError } from "@/lib/alerts";

export const dynamic = "force-dynamic";

function extractProvidedSecret(req: Request): string {
  const headerSecret = req.headers.get("x-admin-secret")?.trim();
  if (headerSecret) return headerSecret;

  const authHeader = req.headers.get("authorization")?.trim() || "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  return "";
}

export async function GET(req: Request) {
  const configuredSecret = process.env.ADMIN_SECRET?.trim();
  if (!configuredSecret) {
    return NextResponse.json(
      { error: "ADMIN_SECRET is not configured on the server." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  const providedSecret = extractProvidedSecret(req);
  if (!providedSecret || !timingSafeEqualStrings(providedSecret, configuredSecret)) {
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

    const data = await listAdminOrders({ filter, limit, orderId });
    const nowMs = Date.now();

    return NextResponse.json(
      {
        success: true,
        filter,
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
