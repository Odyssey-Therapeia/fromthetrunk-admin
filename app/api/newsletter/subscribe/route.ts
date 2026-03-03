import { rateLimitResponse } from "@/lib/http/rate-limit";
import { forwardToV2, passThroughJson } from "@/lib/http/proxy-v2";

export async function POST(request: Request) {
  // Rate limit: 3 subscribe attempts per minute per IP
  const rateLimited = rateLimitResponse(request, "newsletter:sub", {
    limit: 3,
    windowSeconds: 60,
  });
  if (rateLimited) return rateLimited;

  const response = await forwardToV2(request, "/newsletter/subscribe");
  return passThroughJson(response);
}
