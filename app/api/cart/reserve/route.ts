import { rateLimitResponse } from "@/lib/http/rate-limit";
import { forwardToV2, passThroughJson } from "@/lib/http/proxy-v2";

export async function POST(request: Request) {
  const rateLimited = rateLimitResponse(request, "cart:reserve", {
    limit: 10,
    windowSeconds: 60,
  });
  if (rateLimited) return rateLimited;

  const response = await forwardToV2(request, "/cart/reserve");
  return passThroughJson(response);
}
