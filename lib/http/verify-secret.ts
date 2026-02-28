import crypto from "crypto";

/**
 * Timing-safe comparison of a bearer token against a secret.
 *
 * Uses crypto.timingSafeEqual to prevent timing attacks that could
 * leak the secret value byte-by-byte.
 */
export function verifyBearerSecret(
  authHeader: string | null,
  secret: string
): boolean {
  if (!authHeader || !secret) return false;

  const expected = `Bearer ${secret}`;

  if (authHeader.length !== expected.length) return false;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(authHeader),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}
