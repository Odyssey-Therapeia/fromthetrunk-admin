import { describe, expect, it } from "vitest";

import { buildClientCallbackUrl } from "@/lib/auth/client-callback-url";

describe("buildClientCallbackUrl", () => {
  it("builds an absolute URL for relative callback paths", () => {
    expect(buildClientCallbackUrl("/account/profile", "/", "http://127.0.0.1:3001")).toBe(
      "http://127.0.0.1:3001/account/profile"
    );
  });

  it("normalizes callback URLs back to the active origin", () => {
    expect(
      buildClientCallbackUrl(
        "http://localhost:3000/admin?tab=orders",
        "/account/profile",
        "http://127.0.0.1:3001"
      )
    ).toBe("http://127.0.0.1:3001/admin?tab=orders");
  });

  it("falls back safely when the callback is missing", () => {
    expect(buildClientCallbackUrl(null, "/account/profile", "http://127.0.0.1:3001")).toBe(
      "http://127.0.0.1:3001/account/profile"
    );
  });
});
