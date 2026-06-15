/**
 * P3-06: Preview Route Handler tests — mutation-proven no-draft-leak guard.
 *
 * Tests the GET /api/preview route handler directly.
 *
 * MUTATION GUARD (load-bearing):
 *   - Removing the verifyPreviewToken call in the route handler MUST fail
 *     the "forged/expired/wrong-slug token returns 401" tests.
 *   - Without this guard, draftMode would be enabled for ANY request,
 *     leaking drafts publicly.
 *
 * Test layers:
 *   - Valid token + correct slug → 307 redirect (draftMode.enable called)
 *   - Missing slug → 400
 *   - Missing token → 401
 *   - Forged token → 401 (MUTATION GUARD)
 *   - Expired token → 401 (MUTATION GUARD)
 *   - Token for slug-A + request for slug-B → 401 (cross-slug, MUTATION GUARD)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock next/headers (draftMode) ────────────────────────────────────────────
const enableMock = vi.fn();
vi.mock("next/headers", () => ({
  draftMode: vi.fn().mockResolvedValue({ enable: enableMock }),
}));

// ── Mock next/navigation (redirect — throws internally so we catch it) ────────
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    // next/navigation redirect() throws a special NEXT_REDIRECT error.
    // We simulate that so the handler's catch clause is not triggered.
    const err = new Error(`NEXT_REDIRECT:${url}`);
    (err as NodeJS.ErrnoException).code = "NEXT_REDIRECT";
    throw err;
  }),
}));

// ── Import the route handler AFTER mocks ─────────────────────────────────────
import { createPreviewToken } from "@/lib/content/preview-token";

// We import the GET handler lazily (after env is set) in beforeEach.
let GET: (req: Request) => Promise<Response>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(params: Record<string, string | undefined>): Request {
  const url = new URL("http://localhost/api/preview");
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, v);
  }
  return new Request(url.toString());
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  process.env.NEXTAUTH_SECRET = "test-preview-secret-32chars!!!!!!";
  vi.clearAllMocks();
  // Re-import after env setup to pick up fresh module state.
  const mod = await import("@/app/api/preview/route");
  GET = mod.GET as (req: Request) => Promise<Response>;
});

// ── Valid token → redirect ────────────────────────────────────────────────────

describe("GET /api/preview — valid token", () => {
  it("enables draftMode and redirects to /<slug>?__preview_token=... for a valid token", async () => {
    const slug = "my-preview-page";
    const token = createPreviewToken(slug);

    let redirectUrl: string | undefined;
    try {
      await GET(makeRequest({ slug, __preview_token: token }));
    } catch (err) {
      const e = err as Error;
      if (e.message.startsWith("NEXT_REDIRECT:")) {
        redirectUrl = e.message.slice("NEXT_REDIRECT:".length);
      } else {
        throw err;
      }
    }

    expect(enableMock).toHaveBeenCalledTimes(1);
    expect(redirectUrl).toBeDefined();
    expect(redirectUrl).toContain(`/${slug}`);
    expect(redirectUrl).toContain("__preview_token=");
  });
});

// ── Missing slug → 400 ───────────────────────────────────────────────────────

describe("GET /api/preview — missing slug", () => {
  it("returns 400 when slug is absent", async () => {
    const token = createPreviewToken("some-page");
    const res = await GET(makeRequest({ __preview_token: token }));

    expect(res.status).toBe(400);
    expect(enableMock).not.toHaveBeenCalled();
  });
});

// ── MUTATION GUARD: invalid tokens must return 401 ───────────────────────────
// These tests ensure that removing verifyPreviewToken from the handler would
// cause them to fail (they would redirect instead of 401ing).

describe("GET /api/preview — MUTATION GUARD (no-draft-leak)", () => {
  it("returns 401 when token is absent — forging by omission", async () => {
    const res = await GET(makeRequest({ slug: "secret-draft" }));

    expect(res.status).toBe(401);
    // draftMode must NOT be enabled for an absent token
    expect(enableMock).not.toHaveBeenCalled();
  });

  it("returns 401 for a forged (tampered HMAC) token", async () => {
    const slug = "target-page";
    const realToken = createPreviewToken(slug);
    // Tamper the first 6 hex chars of the HMAC part
    const lastPipe = realToken.lastIndexOf("|");
    const forged = "aabbcc" + realToken.slice(6, lastPipe) + realToken.slice(lastPipe);

    const res = await GET(makeRequest({ slug, __preview_token: forged }));

    expect(res.status).toBe(401);
    expect(enableMock).not.toHaveBeenCalled();
  });

  it("returns 401 for an expired token", async () => {
    const slug = "expired-page";
    const expiredToken = createPreviewToken(slug, Date.now() - 1000);

    const res = await GET(makeRequest({ slug, __preview_token: expiredToken }));

    expect(res.status).toBe(401);
    expect(enableMock).not.toHaveBeenCalled();
  });

  it("returns 401 when token is for slug-A but request is for slug-B (cross-slug replay blocked)", async () => {
    const slugA = "page-alpha";
    const slugB = "page-beta";
    const tokenForA = createPreviewToken(slugA);

    // Use slug-B in the request, but slug-A's token — must be rejected
    const res = await GET(makeRequest({ slug: slugB, __preview_token: tokenForA }));

    expect(res.status).toBe(401);
    expect(enableMock).not.toHaveBeenCalled();
  });

  it("returns 401 for a structurally invalid token string", async () => {
    const res = await GET(
      makeRequest({ slug: "any-page", __preview_token: "notavalidtoken" })
    );

    expect(res.status).toBe(401);
    expect(enableMock).not.toHaveBeenCalled();
  });
});
