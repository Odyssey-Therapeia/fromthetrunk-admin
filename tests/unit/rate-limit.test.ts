import { describe, expect, it } from "vitest";

import { checkRateLimit, getRateLimitKey } from "@/lib/http/rate-limit";

describe("checkRateLimit", () => {
  it("allows requests within the limit", async () => {
    const key = `test-allow-${Date.now()}`;
    const result = await checkRateLimit(key, { limit: 5, windowSeconds: 60 });

    expect(result.success).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("blocks requests exceeding the limit", async () => {
    const key = `test-block-${Date.now()}`;
    const options = { limit: 2, windowSeconds: 60 };

    await checkRateLimit(key, options); // 1
    await checkRateLimit(key, options); // 2
    const result = await checkRateLimit(key, options); // 3 — should be blocked

    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("tracks separate keys independently", async () => {
    const ts = Date.now();
    const keyA = `test-a-${ts}`;
    const keyB = `test-b-${ts}`;
    const options = { limit: 1, windowSeconds: 60 };

    const a = await checkRateLimit(keyA, options);
    const b = await checkRateLimit(keyB, options);

    expect(a.success).toBe(true);
    expect(b.success).toBe(true);

    const a2 = await checkRateLimit(keyA, options);
    expect(a2.success).toBe(false);
  });

  it("returns resetAt in the future", async () => {
    const key = `test-reset-${Date.now()}`;
    const result = await checkRateLimit(key, { limit: 5, windowSeconds: 60 });

    expect(result.resetAt).toBeGreaterThan(Date.now());
  });
});

describe("getRateLimitKey", () => {
  const makeRequest = (headers: Record<string, string>) =>
    new Request("https://example.com/", { headers });

  it("uses x-real-ip when present, ignoring x-forwarded-for", () => {
    const req = makeRequest({
      "x-real-ip": "10.0.0.1",
      "x-forwarded-for": "1.1.1.1, 2.2.2.2",
    });
    expect(getRateLimitKey(req, "test")).toBe("test:10.0.0.1");
  });

  it("falls back to the last XFF hop when x-real-ip is absent", () => {
    const req = makeRequest({
      "x-forwarded-for": "1.1.1.1, 2.2.2.2",
    });
    expect(getRateLimitKey(req, "test")).toBe("test:2.2.2.2");
  });

  it("uses the last XFF hop for a forged multi-hop header (not the first)", () => {
    // Client forges 1.1.1.1 as the first hop; the proxy appends its own 2.2.2.2.
    // The key should be 2.2.2.2 (last / trusted), NOT 1.1.1.1 (client-controlled).
    const req = makeRequest({
      "x-forwarded-for": "1.1.1.1, 2.2.2.2",
    });
    const key = getRateLimitKey(req, "prefix");
    expect(key).toBe("prefix:2.2.2.2");
    expect(key).not.toBe("prefix:1.1.1.1");
  });

  it('returns "unknown" when neither x-real-ip nor x-forwarded-for is present', () => {
    const req = makeRequest({});
    expect(getRateLimitKey(req, "prefix")).toBe("prefix:unknown");
  });
});
