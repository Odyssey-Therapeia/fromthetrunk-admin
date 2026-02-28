import { describe, expect, it } from "vitest";

import { checkRateLimit } from "@/lib/http/rate-limit";

describe("checkRateLimit", () => {
  it("allows requests within the limit", () => {
    const key = `test-allow-${Date.now()}`;
    const result = checkRateLimit(key, { limit: 5, windowSeconds: 60 });

    expect(result.success).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("blocks requests exceeding the limit", () => {
    const key = `test-block-${Date.now()}`;
    const options = { limit: 2, windowSeconds: 60 };

    checkRateLimit(key, options); // 1
    checkRateLimit(key, options); // 2
    const result = checkRateLimit(key, options); // 3 — should be blocked

    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("tracks separate keys independently", () => {
    const ts = Date.now();
    const keyA = `test-a-${ts}`;
    const keyB = `test-b-${ts}`;
    const options = { limit: 1, windowSeconds: 60 };

    const a = checkRateLimit(keyA, options);
    const b = checkRateLimit(keyB, options);

    expect(a.success).toBe(true);
    expect(b.success).toBe(true);

    const a2 = checkRateLimit(keyA, options);
    expect(a2.success).toBe(false);
  });

  it("returns resetAt in the future", () => {
    const key = `test-reset-${Date.now()}`;
    const result = checkRateLimit(key, { limit: 5, windowSeconds: 60 });

    expect(result.resetAt).toBeGreaterThan(Date.now());
  });
});
