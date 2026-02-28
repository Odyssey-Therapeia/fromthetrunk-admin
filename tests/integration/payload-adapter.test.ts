import type { AdapterAccount } from "next-auth/adapters";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/payload/server", () => ({
  getPayloadClient: vi.fn(),
}));

import { PayloadAdapter } from "@/lib/auth/payload-adapter";
import { getPayloadClient } from "@/lib/payload/server";

const baseAccount: AdapterAccount = {
  access_token: "access_token",
  provider: "google",
  providerAccountId: "provider_account_1",
  refresh_token: "refresh_token",
  token_type: "bearer",
  type: "oauth",
  userId: "user_1",
};

describe("PayloadAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a linked account when no record exists", async () => {
    const payloadMock = {
      create: vi.fn().mockResolvedValue({}),
      find: vi.fn().mockResolvedValue({ docs: [] }),
      update: vi.fn(),
    };
    vi.mocked(getPayloadClient).mockResolvedValue(payloadMock as any);

    const adapter = PayloadAdapter();
    await adapter.linkAccount?.(baseAccount);

    expect(payloadMock.create).toHaveBeenCalledTimes(1);
    expect(payloadMock.update).not.toHaveBeenCalled();
  });

  it("updates a linked account when provider identity already exists", async () => {
    const payloadMock = {
      create: vi.fn(),
      find: vi.fn().mockResolvedValue({ docs: [{ id: "acc_existing" }] }),
      update: vi.fn().mockResolvedValue({}),
    };
    vi.mocked(getPayloadClient).mockResolvedValue(payloadMock as any);

    const adapter = PayloadAdapter();
    await adapter.linkAccount?.(baseAccount);

    expect(payloadMock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "auth_accounts",
        id: "acc_existing",
      })
    );
    expect(payloadMock.create).not.toHaveBeenCalled();
  });

  it("returns null from getSessionAndUser when the linked user no longer exists", async () => {
    const payloadMock = {
      find: vi.fn().mockResolvedValue({
        docs: [
          {
            expires: "2026-01-01T00:00:00.000Z",
            sessionToken: "session_1",
            user: "user_1",
          },
        ],
      }),
      findByID: vi.fn().mockRejectedValue(new Error("not found")),
    };
    vi.mocked(getPayloadClient).mockResolvedValue(payloadMock as any);

    const adapter = PayloadAdapter();
    const result = await adapter.getSessionAndUser?.("session_1");

    expect(result).toBeNull();
  });

  it("persists and consumes verification tokens", async () => {
    const payloadMock = {
      create: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      find: vi.fn().mockResolvedValue({
        docs: [
          {
            expires: "2026-01-01T00:00:00.000Z",
            id: "token_record_1",
            identifier: "buyer@example.com",
            token: "token_abc",
          },
        ],
      }),
    };
    vi.mocked(getPayloadClient).mockResolvedValue(payloadMock as any);

    const adapter = PayloadAdapter();

    await adapter.createVerificationToken?.({
      expires: new Date("2026-01-01T00:00:00.000Z"),
      identifier: "buyer@example.com",
      token: "token_abc",
    });

    const consumed = await adapter.useVerificationToken?.({
      identifier: "buyer@example.com",
      token: "token_abc",
    });

    expect(payloadMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "auth_verification_tokens",
      })
    );
    expect(payloadMock.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "auth_verification_tokens",
        id: "token_record_1",
      })
    );
    expect(consumed).toMatchObject({
      identifier: "buyer@example.com",
      token: "token_abc",
    });
  });
});
