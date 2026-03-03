import { forwardToV2, passThroughJson } from "@/lib/http/proxy-v2";

export async function POST(request: Request) {
  const response = await forwardToV2(request, "/cart/release");
  return passThroughJson(response);
}
