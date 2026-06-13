import crypto from "crypto";

const getOrderAccessSecret = () =>
  process.env.NEXTAUTH_SECRET || process.env.PAYLOAD_SECRET || process.env.ADMIN_API_SECRET;

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function createOrderAccessToken(orderId: string, expiresAt?: number): string {
  const secret = getOrderAccessSecret();
  if (!secret) {
    throw new Error("Order access token secret is not configured.");
  }
  const expiry = expiresAt ?? Date.now() + THIRTY_DAYS_MS;
  const hmac = crypto
    .createHmac("sha256", secret)
    .update(`${orderId}|${expiry}`)
    .digest("hex");
  return `${hmac}|${expiry}`;
}

export function verifyOrderAccessToken(orderId: string, token: string | undefined): boolean {
  if (!token) return false;
  try {
    const lastPipe = token.lastIndexOf("|");
    if (lastPipe === -1) return false;
    const hmacPart = token.slice(0, lastPipe);
    const expiryStr = token.slice(lastPipe + 1);
    const expiry = Number(expiryStr);
    if (!Number.isFinite(expiry) || Date.now() > expiry) return false;
    const secret = getOrderAccessSecret();
    if (!secret) return false;
    const expectedHmac = crypto
      .createHmac("sha256", secret)
      .update(`${orderId}|${expiry}`)
      .digest("hex");
    const expected = Buffer.from(expectedHmac, "hex");
    const received = Buffer.from(hmacPart, "hex");
    return expected.length === received.length && crypto.timingSafeEqual(expected, received);
  } catch {
    return false;
  }
}
