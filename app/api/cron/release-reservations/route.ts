import { NextRequest } from "next/server";

import { forwardToV2 } from "@/lib/http/proxy-v2";

const proxyCron = async (request: NextRequest) =>
  forwardToV2(request, "/cron/release-reservations", {
    preserveSearch: false,
  });

export async function GET(request: NextRequest) {
  return proxyCron(request);
}

export async function POST(request: NextRequest) {
  return proxyCron(request);
}
