/**
 * P6-01: Email-change verification token.
 *
 * Reuses the P1-11 HMAC-SHA256 + expiry pattern from
 * lib/orders/order-access-token.ts, but binds the token to
 * `${userId}|${newEmail}|${expiry}` so a token cannot be replayed
 * for a different user or a different target email.
 *
 * Verification:
 *  - parses the token format `${hmac}|${userId}|${newEmail}|${expiry}`
 *  - checks expiry (token is valid for 24 hours by default)
 *  - compares HMAC with timing-safe equal
 *  - caller is responsible for checking newEmail collision
 */

import crypto from "crypto";

const getSecret = () =>
  process.env.NEXTAUTH_SECRET ||
  process.env.PAYLOAD_SECRET ||
  process.env.ADMIN_API_SECRET;

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * Build a signed token that encodes userId + newEmail + expiry.
 *
 * Format: `${hmac}|${userId}|${newEmail}|${expiry}`
 *
 * The HMAC is computed over `${userId}|${newEmail}|${expiry}` which binds
 * the token to both the account being changed and the target email address.
 */
export function createEmailVerificationToken(
  userId: string,
  newEmail: string,
  expiresAt?: number
): string {
  const secret = getSecret();
  if (!secret) {
    throw new Error("Email verification token secret is not configured.");
  }
  const expiry = expiresAt ?? Date.now() + TWENTY_FOUR_HOURS_MS;
  const message = `${userId}|${newEmail}|${expiry}`;
  const hmac = crypto.createHmac("sha256", secret).update(message).digest("hex");
  return `${hmac}|${userId}|${newEmail}|${expiry}`;
}

export type VerifyEmailTokenResult =
  | { valid: true; userId: string; newEmail: string }
  | { valid: false };

/**
 * Verify a previously issued email-change token.
 *
 * Returns `{ valid: true, userId, newEmail }` on success,
 * `{ valid: false }` on any failure (expired, forged, malformed).
 */
export function verifyEmailVerificationToken(token: string | undefined): VerifyEmailTokenResult {
  if (!token) return { valid: false };
  try {
    // Format: `${hmac}|${userId}|${newEmail}|${expiry}`
    // userId and newEmail may contain no pipes; expiry is always a numeric suffix.
    // We split on the FIRST pipe (hmac) and the LAST pipe (expiry).
    const firstPipe = token.indexOf("|");
    if (firstPipe === -1) return { valid: false };

    const lastPipe = token.lastIndexOf("|");
    if (lastPipe === firstPipe) return { valid: false }; // need at least 3 segments after hmac

    const hmacPart = token.slice(0, firstPipe);
    const expiryStr = token.slice(lastPipe + 1);
    const middle = token.slice(firstPipe + 1, lastPipe); // `${userId}|${newEmail}`

    const expiry = Number(expiryStr);
    if (!Number.isFinite(expiry) || Date.now() > expiry) return { valid: false };

    // middle = `${userId}|${newEmail}`  — split on first pipe inside middle
    const midPipe = middle.indexOf("|");
    if (midPipe === -1) return { valid: false };
    const userId = middle.slice(0, midPipe);
    const newEmail = middle.slice(midPipe + 1);

    if (!userId || !newEmail) return { valid: false };

    const secret = getSecret();
    if (!secret) return { valid: false };

    const message = `${userId}|${newEmail}|${expiry}`;
    const expectedHmac = crypto
      .createHmac("sha256", secret)
      .update(message)
      .digest("hex");

    const expected = Buffer.from(expectedHmac, "hex");
    const received = Buffer.from(hmacPart, "hex");

    if (
      expected.length !== received.length ||
      !crypto.timingSafeEqual(expected, received)
    ) {
      return { valid: false };
    }

    return { valid: true, userId, newEmail };
  } catch {
    return { valid: false };
  }
}
