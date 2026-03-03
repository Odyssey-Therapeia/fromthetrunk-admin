import { forwardToV2, passThroughJson } from "@/lib/http/proxy-v2";

/**
 * POST /api/webhooks/razorpay
 *
 * Handles asynchronous payment events from Razorpay.
 * Verifies webhook signature before processing.
 */
export async function POST(request: Request) {
  const response = await forwardToV2(request, "/webhooks/razorpay", {
    preserveSearch: false,
  });
  return passThroughJson(response);
}
