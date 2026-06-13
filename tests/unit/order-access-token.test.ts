import { describe, it, expect, beforeEach } from "vitest";

import {
  createOrderAccessToken,
  verifyOrderAccessToken,
} from "@/lib/orders/order-access-token";

describe("order-access-token", () => {
  beforeEach(() => {
    process.env.NEXTAUTH_SECRET = "test-secret";
  });

  it("valid token: create then verify returns true", () => {
    const token = createOrderAccessToken("order-123");
    expect(verifyOrderAccessToken("order-123", token)).toBe(true);
  });

  it("tampered hmac part returns false", () => {
    const token = createOrderAccessToken("order-123");
    const lastPipe = token.lastIndexOf("|");
    const tampered = "aabbcc" + token.slice(6, lastPipe) + token.slice(lastPipe);
    expect(verifyOrderAccessToken("order-123", tampered)).toBe(false);
  });

  it("expired token returns false", () => {
    const token = createOrderAccessToken("order-123", Date.now() - 1000);
    expect(verifyOrderAccessToken("order-123", token)).toBe(false);
  });

  it("old-format token (hex only, no pipe) returns false", () => {
    const oldFormatToken =
      "a".repeat(64); // 64-char hex string with no pipe
    expect(verifyOrderAccessToken("order-123", oldFormatToken)).toBe(false);
  });

  it("wrong orderId returns false", () => {
    const token = createOrderAccessToken("order-123");
    expect(verifyOrderAccessToken("order-999", token)).toBe(false);
  });
});
