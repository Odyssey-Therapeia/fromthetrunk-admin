/**
 * P3-06: CMS draft-mode enable Route Handler.
 *
 * Called by the "Preview" button (via the signed preview URL generated at
 * GET /api/v2/admin/pages/:id/preview-token).
 *
 * Flow:
 *   1. Admin opens preview URL: /api/preview?slug=<slug>&__preview_token=<token>
 *   2. This handler verifies the HMAC token server-side (slug-bound + expiry).
 *   3. On success: enables Next.js draftMode via cookie, redirects to /<slug>
 *      (passing __preview_token in the query so the CMS page's double-guard
 *      also passes: isDraftModeEnabled AND verifyPreviewToken must BOTH hold).
 *   4. On failure (forged / expired / wrong-slug): returns 401.
 *
 * LOAD-BEARING: this route is the ONLY way to enable draftMode.  Without a
 * valid, slug-bound, non-expired HMAC token, draftMode is never enabled and
 * the public catch-all page serves published-only content (no-draft-leak
 * guard from P3-03 holds).
 *
 * PREVIEW SECURITY (mutation-proven in tests/unit/preview-route.test.ts):
 *   - A forged token returns 401 (draftMode never enabled).
 *   - An expired token returns 401.
 *   - A token for slug-A does NOT enable preview for slug-B.
 */

import { redirect } from "next/navigation";
import { draftMode } from "next/headers";
import { NextResponse } from "next/server";

import { verifyPreviewToken } from "@/lib/content/preview-token";

export async function GET(request: Request): Promise<NextResponse | never> {
  const url = new URL(request.url);
  const { searchParams } = url;
  const slug = searchParams.get("slug");
  const token = searchParams.get("__preview_token") ?? undefined;

  // Both slug and token are required.
  if (!slug) {
    return new NextResponse(
      JSON.stringify({ code: "MISSING_SLUG", message: "Missing slug parameter." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Verify the HMAC token (slug-bound, expiry-checked, timing-safe).
  // A forged / expired / wrong-slug token fails here — draftMode is NEVER
  // enabled for an invalid token (load-bearing guard).
  if (!verifyPreviewToken(slug, token)) {
    return new NextResponse(
      JSON.stringify({
        code: "INVALID_TOKEN",
        message: "Preview token is invalid or has expired.",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  // Enable draftMode — sets the Next.js draft-mode bypass cookie on the
  // response so the subsequent CMS catch-all page sees isEnabled = true.
  (await draftMode()).enable();

  // Redirect to the CMS page, carrying the token in the query so the
  // catch-all page's double-guard (isDraftModeEnabled && verifyPreviewToken)
  // also passes — both conditions are required simultaneously.
  redirect(`/${slug}?__preview_token=${encodeURIComponent(token ?? "")}`);
}
