import { afterEach, describe, expect, it, vi } from "vitest";

import { getSiteOrigin } from "@/lib/config/site";

describe("getSiteOrigin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns NEXT_PUBLIC_SERVER_URL when set", () => {
    vi.stubEnv("NEXT_PUBLIC_SERVER_URL", "https://example.com");
    vi.stubEnv("NODE_ENV", "development");
    expect(getSiteOrigin()).toBe("https://example.com");
  });

  it("returns the canonical domain when NEXT_PUBLIC_SERVER_URL is unset in development", () => {
    vi.stubEnv("NEXT_PUBLIC_SERVER_URL", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(getSiteOrigin()).toBe("https://www.fromthetrunk.shop");
  });

  it("throws when NEXT_PUBLIC_SERVER_URL is unset in production", () => {
    vi.stubEnv("NEXT_PUBLIC_SERVER_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => getSiteOrigin()).toThrow(
      "NEXT_PUBLIC_SERVER_URL is required in production"
    );
  });

  it("strips trailing slash from NEXT_PUBLIC_SERVER_URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SERVER_URL", "https://example.com/");
    vi.stubEnv("NODE_ENV", "development");
    expect(getSiteOrigin()).toBe("https://example.com");
  });
});
