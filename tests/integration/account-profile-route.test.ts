import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/get-session", () => ({
  getServerAuthSession: vi.fn(),
}));

vi.mock("@/lib/payload/server", () => ({
  getPayloadClient: vi.fn(),
}));

import { getServerAuthSession } from "@/lib/auth/get-session";
import { GET } from "@/app/api/account/profile/route";
import { getPayloadClient } from "@/lib/payload/server";

describe("/api/account/profile GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 for unauthenticated requests", async () => {
    vi.mocked(getServerAuthSession).mockResolvedValue(null);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      code: "UNAUTHORIZED",
      message: "Unauthorized",
    });
    expect(getPayloadClient).not.toHaveBeenCalled();
  });
});
