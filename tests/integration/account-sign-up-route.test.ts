import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http/proxy-v2", async () => {
  const actual = await vi.importActual<typeof import("@/lib/http/proxy-v2")>("@/lib/http/proxy-v2");
  return {
    ...actual,
    forwardToV2: vi.fn(),
  };
});

vi.mock("@/lib/http/rate-limit", () => ({
  rateLimitResponse: vi.fn(() => null),
}));

import { POST } from "@/app/api/account/sign-up/route";
import { forwardToV2 } from "@/lib/http/proxy-v2";
import { rateLimitResponse } from "@/lib/http/rate-limit";

describe("/api/account/sign-up POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rateLimitResponse).mockReturnValue(null);
  });

  it("returns rate-limit response without forwarding", async () => {
    const request = new Request("http://localhost/api/account/sign-up", {
      body: JSON.stringify({ email: "reader@example.com" }),
      method: "POST",
    });
    vi.mocked(rateLimitResponse).mockReturnValueOnce(new Response("Too many requests", { status: 429 }));

    const response = await POST(request);

    expect(response.status).toBe(429);
    expect(forwardToV2).not.toHaveBeenCalled();
  });

  it("forwards to /users/sign-up and maps success payload", async () => {
    const request = new Request("http://localhost/api/account/sign-up", {
      body: JSON.stringify({
        email: "reader@example.com",
        name: "Reader",
        password: "StrongPass123!",
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    vi.mocked(forwardToV2).mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "usr_1" }), {
        headers: { "content-type": "application/json" },
        status: 201,
      })
    );

    const response = await POST(request);
    const body = await response.json();

    expect(forwardToV2).toHaveBeenCalledWith(request, "/users/sign-up");
    expect(response.status).toBe(201);
    expect(body).toEqual({
      created: true,
      message: "Account created successfully. Please sign in to continue.",
    });
  });
});
