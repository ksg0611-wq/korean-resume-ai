import { handleConfirmPaymentRequest } from "@/lib/paymentHandlers";

export async function POST(req: Request) {
  return handleConfirmPaymentRequest(req, {
    serviceType: "resume",
    routePath: "/api/payments/success",
  });
}
