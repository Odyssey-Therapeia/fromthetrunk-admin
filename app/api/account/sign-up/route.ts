import { rateLimitResponse } from "@/lib/http/rate-limit";
import { forwardToV2, passThroughJson } from "@/lib/http/proxy-v2";

export async function POST(request: Request) {
  const rateLimited = rateLimitResponse(request, "auth:signup", {
    limit: 5,
    windowSeconds: 60,
  });
  if (rateLimited) return rateLimited;

  const response = await forwardToV2(request, "/users/sign-up");
  return passThroughJson(response, (value) => {
    if (!response.ok) return value;
    return {
      created: true,
      message: "Account created successfully. Please sign in to continue.",
    };
  });
}
