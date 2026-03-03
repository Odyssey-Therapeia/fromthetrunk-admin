import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http/proxy-v2", async () => {
  const actual = await vi.importActual<typeof import("@/lib/http/proxy-v2")>("@/lib/http/proxy-v2");
  return {
    ...actual,
    forwardToV2: vi.fn(),
  };
});

import { GET, PATCH } from "@/app/api/account/profile/route";
import { forwardToV2 } from "@/lib/http/proxy-v2";

describe("/api/account/profile route proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps nested defaultAddress object to legacy id field on GET", async () => {
    const request = new Request("http://localhost/api/account/profile", {
      method: "GET",
    });
    vi.mocked(forwardToV2).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          defaultAddress: { id: "addr_1" },
          email: "reader@example.com",
          id: "user_1",
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        }
      )
    );

    const response = await GET(request);
    const body = await response.json();

    expect(forwardToV2).toHaveBeenCalledWith(request, "/users/me");
    expect(response.status).toBe(200);
    expect(body.defaultAddress).toBe("addr_1");
  });

  it("rewrites PATCH defaultAddress to defaultAddressId before forwarding", async () => {
    const request = new Request("http://localhost/api/account/profile", {
      body: JSON.stringify({
        defaultAddress: "addr_9",
        name: "Reader Updated",
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "PATCH",
    });
    vi.mocked(forwardToV2).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          defaultAddressId: "addr_9",
          id: "user_1",
          name: "Reader Updated",
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        }
      )
    );

    const response = await PATCH(request);
    const body = await response.json();

    expect(forwardToV2).toHaveBeenCalledWith(
      request,
      "/users/me",
      expect.objectContaining({
        body: {
          defaultAddressId: "addr_9",
          name: "Reader Updated",
        },
        preserveSearch: false,
      })
    );
    expect(body.defaultAddress).toBe("addr_9");
    expect(body.name).toBe("Reader Updated");
  });
});
