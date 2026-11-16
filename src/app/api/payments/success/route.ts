import { handleConfirmPaymentRequest } from "@/lib/paymentHandlers";
import { PRICING_PLANS } from "@/lib/policy";

export async function POST(req: Request) {
  return handleConfirmPaymentRequest(req, {
    serviceType: "resume",
    routePath: "/api/payments/success",
    allowedAmounts: [PRICING_PLANS.resume_single.price, PRICING_PLANS.bundle.price],
  });
}
