import { forwardToV2, passThroughJson } from "@/lib/http/proxy-v2";

export async function GET(request: Request) {
  const response = await forwardToV2(request, "/addresses");
  return passThroughJson(response, (value) => {
    if (!response.ok || !Array.isArray(value)) return value;
    return { addresses: value };
  });
}

export async function POST(request: Request) {
  const response = await forwardToV2(request, "/addresses");
  return passThroughJson(response, (value) => {
    if (!response.ok) return value;
    return { address: value };
  });
}
