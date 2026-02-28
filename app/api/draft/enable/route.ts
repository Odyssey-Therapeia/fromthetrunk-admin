import { draftMode } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { errorResponse } from "@/lib/http/error-response";

const getPreviewSecret = () => process.env.PAYLOAD_PREVIEW_SECRET || "";

const resolveRedirectPath = (request: NextRequest) => {
  const slug = request.nextUrl.searchParams.get("slug") || "/";
  if (!slug.startsWith("/")) {
    return null;
  }

  return slug;
};

export async function GET(request: NextRequest) {
  const configuredSecret = getPreviewSecret();
  if (!configuredSecret) {
    return errorResponse(
      500,
      "Preview secret is not configured.",
      "PREVIEW_SECRET_MISSING"
    );
  }

  const providedSecret = request.nextUrl.searchParams.get("secret");
  if (!providedSecret || providedSecret !== configuredSecret) {
    return errorResponse(401, "Invalid preview secret.", "INVALID_PREVIEW_SECRET");
  }

  const path = resolveRedirectPath(request);
  if (!path) {
    return errorResponse(400, "Invalid preview path.", "INVALID_PREVIEW_PATH");
  }

  const draft = await draftMode();
  draft.enable();

  return NextResponse.redirect(new URL(path, request.url));
}
