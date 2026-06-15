/**
 * P3-06: CMS preview token — HMAC sign/verify.
 *
 * Reuses the P1-11 order-access-token pattern exactly:
 *   token = "<hmac>|<expiryMs>"
 *   HMAC = sha256("<slug>|<expiryMs>")
 *
 * The slug is included in the HMAC so a valid token for page-A
 * CANNOT be replayed against page-B (no-draft-leak guard).
 *
 * Secret: NEXTAUTH_SECRET (already required in every deployment).
 * A dedicated CMS_PREVIEW_SECRET env-var may be added later but is
 * not strictly necessary because NEXTAUTH_SECRET is already
 * guarded by deployment policy.
 *
 * Expiry default: 1 hour. Preview links are short-lived by design.
 */

import crypto from "crypto";

const ONE_HOUR_MS = 60 * 60 * 1000;

/** Resolves the signing secret — dedicated var preferred, falls back to NEXTAUTH_SECRET. */
function getPreviewSecret(): string | undefined {
  return (
    process.env.CMS_PREVIEW_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.PAYLOAD_SECRET ||
    process.env.ADMIN_API_SECRET
  );
}

/**
 * Creates a signed, expiring preview token for the given CMS page slug.
 *
 * @param slug - The CMS page slug this token is bound to.
 * @param expiresAt - Optional absolute expiry timestamp in ms (default: now + 1 h).
 * @returns "<hmac>|<expiryMs>" string.
 */
export function createPreviewToken(slug: string, expiresAt?: number): string {
  const secret = getPreviewSecret();
  if (!secret) {
    throw new Error(
      "Preview token secret is not configured. Set NEXTAUTH_SECRET."
    );
  }

  const expiry = expiresAt ?? Date.now() + ONE_HOUR_MS;
  const hmac = crypto
    .createHmac("sha256", secret)
    .update(`${slug}|${expiry}`)
    .digest("hex");

  return `${hmac}|${expiry}`;
}

/**
 * Verifies a preview token for the given slug.
 *
 * Returns true ONLY when:
 *   - token is present and well-formed
 *   - HMAC is valid (timing-safe comparison)
 *   - token has not expired
 *   - slug matches (slug is bound into the HMAC — cross-slug replay is rejected)
 *
 * @param slug  - The CMS page slug to verify against.
 * @param token - The raw token string from the request (may be undefined).
 */
export function verifyPreviewToken(
  slug: string,
  token: string | undefined
): boolean {
  if (!token) return false;

  try {
    const lastPipe = token.lastIndexOf("|");
    if (lastPipe === -1) return false;

    const hmacPart = token.slice(0, lastPipe);
    const expiryStr = token.slice(lastPipe + 1);
    const expiry = Number(expiryStr);

    if (!Number.isFinite(expiry) || Date.now() > expiry) return false;

    const secret = getPreviewSecret();
    if (!secret) return false;

    const expectedHmac = crypto
      .createHmac("sha256", secret)
      .update(`${slug}|${expiry}`)
      .digest("hex");

    const expected = Buffer.from(expectedHmac, "hex");
    const received = Buffer.from(hmacPart, "hex");

    if (expected.length !== received.length) return false;
    return crypto.timingSafeEqual(expected, received);
  } catch {
    return false;
  }
}

/**
 * THE load-bearing no-draft-leak gate used by the CMS page renderer.
 *
 * Draft content is rendered ONLY when BOTH conditions are true:
 *   1. Next.js draftMode is enabled in this request (set by /api/preview).
 *   2. A valid, unexpired, slug-bound preview token is present.
 *
 * Condition 2 is the critical re-binding: draftMode is NOT slug-bound
 * (one /api/preview call sets it for the whole session), so this check
 * re-tightens scope to the exact slug + a freshly-minted HMAC token.
 * Removing either arm leaks draft content.
 *
 * This function is extracted from the RSC page component so it can be
 * unit-tested and mutation-proven without importing the async RSC.
 *
 * Unit tests: tests/unit/preview-guard.test.ts
 *
 * @param isDraftModeEnabled - Value of draftMode().isEnabled from Next.js headers.
 * @param slug               - The CMS page slug being rendered.
 * @param token              - Raw ?__preview_token value from searchParams (may be undefined).
 */
export function shouldRenderDraft(
  isDraftModeEnabled: boolean,
  slug: string,
  token: string | undefined
): boolean {
  return isDraftModeEnabled && verifyPreviewToken(slug, token);
}
