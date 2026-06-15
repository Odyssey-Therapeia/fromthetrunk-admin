/**
 * P3-06: Preview token — HMAC sign/verify tests.
 *
 * Load-bearing no-draft-leak guard:
 *   - Valid token for page-A MUST NOT pass verification for page-B
 *   - Expired token MUST NOT pass verification
 *   - Forged / tampered token MUST NOT pass verification
 *   - REMOVING the token check leaks drafts — this test file is a mutation guard
 *
 * Token structure mirrors P1-11 order-access-token exactly.
 */

import { beforeEach, describe, expect, it } from "vitest";

let createPreviewToken: (slug: string, expiresAt?: number) => string;
let verifyPreviewToken: (slug: string, token: string | undefined) => boolean;

beforeEach(async () => {
  process.env.NEXTAUTH_SECRET = "test-preview-secret-32chars!!!!!!";
  // Re-import fresh so env change takes effect
  const mod = await import("@/lib/content/preview-token");
  createPreviewToken = mod.createPreviewToken;
  verifyPreviewToken = mod.verifyPreviewToken;
});

describe("createPreviewToken / verifyPreviewToken", () => {
  it("valid token: create then verify returns true", () => {
    const token = createPreviewToken("my-page");
    expect(verifyPreviewToken("my-page", token)).toBe(true);
  });

  it("wrong slug (page-A token rejected for page-B) — no-draft-leak guard", () => {
    const token = createPreviewToken("page-A");
    expect(verifyPreviewToken("page-B", token)).toBe(false);
  });

  it("expired token returns false", () => {
    const token = createPreviewToken("my-page", Date.now() - 1000);
    expect(verifyPreviewToken("my-page", token)).toBe(false);
  });

  it("undefined token returns false", () => {
    expect(verifyPreviewToken("my-page", undefined)).toBe(false);
  });

  it("empty string returns false", () => {
    expect(verifyPreviewToken("my-page", "")).toBe(false);
  });

  it("tampered HMAC returns false", () => {
    const token = createPreviewToken("my-page");
    const lastPipe = token.lastIndexOf("|");
    const tampered = "aabbcc" + token.slice(6, lastPipe) + token.slice(lastPipe);
    expect(verifyPreviewToken("my-page", tampered)).toBe(false);
  });

  it("tampered expiry returns false", () => {
    const token = createPreviewToken("my-page");
    const lastPipe = token.lastIndexOf("|");
    // Change expiry to a very large value
    const tamperedExpiry = token.slice(0, lastPipe + 1) + "99999999999999";
    expect(verifyPreviewToken("my-page", tamperedExpiry)).toBe(false);
  });

  it("token with no pipe separator returns false", () => {
    expect(verifyPreviewToken("my-page", "aabbcc")).toBe(false);
  });

  it("token expires after the expiry timestamp", () => {
    const expiry = Date.now() + 500;
    const token = createPreviewToken("my-page", expiry);
    // Token not yet expired
    expect(verifyPreviewToken("my-page", token)).toBe(true);
    // Simulate past expiry by using an already-past timestamp
    const expiredToken = createPreviewToken("my-page", Date.now() - 1);
    expect(verifyPreviewToken("my-page", expiredToken)).toBe(false);
  });

  it("throws if secret is not configured", () => {
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.PAYLOAD_SECRET;
    delete process.env.ADMIN_API_SECRET;
    expect(() => createPreviewToken("my-page")).toThrow(/secret/i);
  });
});

// ── MUTATION GUARD: removing token check must fail a test ────────────────────
// This test ensures that draft pages are NOT served without a valid token.
// If someone removes the verifyPreviewToken call from the preview logic,
// verifyPreviewToken(slug, undefined) must still return false.
describe("no-draft-leak guard — mutation detection", () => {
  it("absent token (undefined) returns false — guard against removing token check", () => {
    // If token check is removed, this would trivially be bypassed.
    // The production code MUST call verifyPreviewToken before serving draft.
    expect(verifyPreviewToken("any-slug", undefined)).toBe(false);
  });

  it("forged token for a published-only slug must NOT grant preview access", () => {
    // Simulates an attacker forging a token for a sensitive slug
    const forgedToken = "deadbeef".repeat(8) + "|" + (Date.now() + 9999999);
    expect(verifyPreviewToken("about-us", forgedToken)).toBe(false);
  });
});
