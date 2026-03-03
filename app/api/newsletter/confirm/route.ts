import { NextRequest } from "next/server";

import { forwardToV2 } from "@/lib/http/proxy-v2";

export async function GET(request: NextRequest) {
  return forwardToV2(request, "/newsletter/confirm");
}
