import { forwardToV2, passThroughJson } from "@/lib/http/proxy-v2";

/**
 * POST /api/payments/verify
 *
 * After the Razorpay checkout modal completes, the client sends back the
 * payment details for server-side signature verification.
 */
export async function POST(request: Request) {
  const response = await forwardToV2(request, "/payments/verify");
  return passThroughJson(response);
}
