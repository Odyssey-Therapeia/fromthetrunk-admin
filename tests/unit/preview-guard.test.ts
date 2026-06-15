/**
 * P3-06: Mutation-proof unit tests for shouldRenderDraft.
 *
 * PURPOSE: The public renderer app/(site)/[...slug]/page.tsx gates draft
 * rendering on shouldRenderDraft(isDraftModeEnabled, slug, previewToken).
 * This function lives in lib/content/preview-token.ts and is extracted
 * EXACTLY so these tests can cover it without importing the async RSC.
 *
 * MUTATION SENSITIVITY REQUIREMENT:
 *   Mutating shouldRenderDraft to `return isDraftModeEnabled` (dropping the
 *   token check) MUST make cases (ii), (iii), and (iv) FAIL. These three
 *   cases are the primary draft-leak vectors:
 *     (ii)  draftMode ON + no token  → attacker has a session cookie, no token
 *     (iii) draftMode ON + forged/garbage/expired token → brute-force/replay
 *     (iv)  draftMode ON + valid token for a DIFFERENT slug → cross-slug replay
 *           (this is THE vector: draftMode cookie is NOT slug-bound)
 *
 * The test is designed so that none of (ii)/(iii)/(iv) would pass if you
 * removed the `&& verifyPreviewToken(slug, token)` arm from shouldRenderDraft.
 */

import { beforeEach, describe, expect, it } from "vitest";

let createPreviewToken: (slug: string, expiresAt?: number) => string;
let shouldRenderDraft: (
  isDraftModeEnabled: boolean,
  slug: string,
  token: string | undefined
) => boolean;

beforeEach(async () => {
  // Must be set before module import so getPreviewSecret() resolves.
  process.env.CMS_PREVIEW_SECRET = "test-preview-secret-32chars!!!!!!";
  // Re-import fresh so the env change takes effect (vitest isolates modules).
  const mod = await import("@/lib/content/preview-token");
  createPreviewToken = mod.createPreviewToken;
  shouldRenderDraft = mod.shouldRenderDraft;
});

describe("shouldRenderDraft — load-bearing no-draft-leak gate", () => {
  // ── (i) Published path: draftMode OFF, valid token present ───────────────
  it("(i) draftMode OFF + valid token → false (published path, no draft)", () => {
    const token = createPreviewToken("my-page");
    expect(shouldRenderDraft(false, "my-page", token)).toBe(false);
  });

  // ── (ii) draftMode ON, NO token — MUTATION-SENSITIVE ─────────────────────
  // If shouldRenderDraft were mutated to `return isDraftModeEnabled`, this
  // would return true and leak the draft to any session with a draftMode cookie.
  it("(ii) draftMode ON + token undefined → false [MUTATION GUARD]", () => {
    expect(shouldRenderDraft(true, "my-page", undefined)).toBe(false);
  });

  // ── (iii) draftMode ON, forged/garbage/expired token — MUTATION-SENSITIVE ─
  it("(iii) draftMode ON + garbage token → false [MUTATION GUARD]", () => {
    expect(shouldRenderDraft(true, "my-page", "deadbeef")).toBe(false);
  });

  it("(iii) draftMode ON + forged hex token → false [MUTATION GUARD]", () => {
    const forged = "deadbeef".repeat(8) + "|" + (Date.now() + 9_999_999);
    expect(shouldRenderDraft(true, "my-page", forged)).toBe(false);
  });

  it("(iii) draftMode ON + expired token → false [MUTATION GUARD]", () => {
    const expired = createPreviewToken("my-page", Date.now() - 1_000);
    expect(shouldRenderDraft(true, "my-page", expired)).toBe(false);
  });

  // ── (iv) draftMode ON, valid token for a DIFFERENT slug — THE load-bearing
  //         vector, since Next.js draftMode cookie is NOT slug-bound.
  //         Once an admin previews page-A, the cookie stays. Without the
  //         token check the next page-B request would serve its draft too.
  it("(iv) draftMode ON + token valid for 'page-A' used for 'page-B' → false [CROSS-SLUG LEAK GUARD]", () => {
    const tokenForA = createPreviewToken("page-A");
    expect(shouldRenderDraft(true, "page-B", tokenForA)).toBe(false);
  });

  it("(iv) draftMode ON + token valid for a deeply-nested slug used for another → false", () => {
    const tokenForFoo = createPreviewToken("parent/child/foo");
    expect(shouldRenderDraft(true, "parent/child/bar", tokenForFoo)).toBe(false);
  });

  // ── (v) Happy path: draftMode ON + valid token for THIS slug ──────────────
  it("(v) draftMode ON + valid token for THIS slug → true (draft renders)", () => {
    const token = createPreviewToken("my-page");
    expect(shouldRenderDraft(true, "my-page", token)).toBe(true);
  });

  it("(v) draftMode ON + valid token for nested slug → true", () => {
    const slug = "parent/child/page";
    const token = createPreviewToken(slug);
    expect(shouldRenderDraft(true, slug, token)).toBe(true);
  });
});
