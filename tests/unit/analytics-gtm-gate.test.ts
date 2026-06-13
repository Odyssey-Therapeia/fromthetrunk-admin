import { afterEach, describe, expect, it, vi } from "vitest";
import { shouldRenderGtm, buildGtmSrc } from "@/lib/analytics/gtm";

/**
 * P1-18 — Analytics base: GTM env-variable gating.
 *
 * The GTM <Script> in app/(site)/layout.tsx is only rendered when
 * NEXT_PUBLIC_GTM_ID is set.  We test the gating logic in the
 * production module lib/analytics/gtm.ts so that changes to the
 * gate immediately break these tests.
 */

describe("GTM script gating (NEXT_PUBLIC_GTM_ID)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is a no-op when NEXT_PUBLIC_GTM_ID is not set", () => {
    vi.stubEnv("NEXT_PUBLIC_GTM_ID", "");
    expect(shouldRenderGtm(process.env.NEXT_PUBLIC_GTM_ID)).toBe(false);
  });

  it("is a no-op when NEXT_PUBLIC_GTM_ID is undefined", () => {
    expect(shouldRenderGtm(undefined)).toBe(false);
  });

  it("renders when NEXT_PUBLIC_GTM_ID is set", () => {
    vi.stubEnv("NEXT_PUBLIC_GTM_ID", "GTM-XXXXXXX");
    expect(shouldRenderGtm(process.env.NEXT_PUBLIC_GTM_ID)).toBe(true);
  });

  it("builds the correct GTM script URL", () => {
    const gtmId = "GTM-XXXXXXX";
    expect(buildGtmSrc(gtmId)).toBe(
      "https://www.googletagmanager.com/gtm.js?id=GTM-XXXXXXX"
    );
  });

  it("does not render when NEXT_PUBLIC_GTM_ID is empty string", () => {
    expect(shouldRenderGtm("")).toBe(false);
  });
});
