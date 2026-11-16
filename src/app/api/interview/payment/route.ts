import { handleConfirmPaymentRequest } from "@/lib/paymentHandlers";
import { PRICING_PLANS } from "@/lib/policy";

export const maxDuration = 120;

export async function POST(req: Request) {
  return handleConfirmPaymentRequest(req, {
    serviceType: "interview",
    routePath: "/api/interview/payment",
    allowedAmounts: [
      PRICING_PLANS.interview_single.price,
      PRICING_PLANS.interview_upgrade.price,
    ],
  });
}
