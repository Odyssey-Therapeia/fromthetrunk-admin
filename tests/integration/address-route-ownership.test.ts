import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/get-session", () => ({
  getServerAuthSession: vi.fn(),
}));

vi.mock("@/lib/payload/server", () => ({
  getPayloadClient: vi.fn(),
}));

import { getServerAuthSession } from "@/lib/auth/get-session";
import { PATCH } from "@/app/api/account/addresses/[id]/route";
import { getPayloadClient } from "@/lib/payload/server";

describe("/api/account/addresses/[id] ownership guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 when a user edits another user's address", async () => {
    vi.mocked(getServerAuthSession).mockResolvedValue({
      user: { id: "user_1" },
    } as any);

    const payloadMock = {
      findByID: vi.fn().mockResolvedValue({
        id: "addr_1",
        user: "user_2",
      }),
    };
    vi.mocked(getPayloadClient).mockResolvedValue(payloadMock as any);

    const request = new Request("http://localhost/api/account/addresses/addr_1", {
      body: JSON.stringify({ line1: "1 Main Street" }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });
    const response = await PATCH(request, { params: { id: "addr_1" } });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toMatchObject({
      code: "FORBIDDEN",
      message: "Forbidden",
    });
  });
});
