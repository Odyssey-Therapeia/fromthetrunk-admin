import { beforeEach, describe, expect, it, vi } from "vitest";

const insertMock = vi.hoisted(() => vi.fn());
const onConflictDoUpdateMock = vi.hoisted(() => vi.fn());
const returningMock = vi.hoisted(() => vi.fn());
const valuesMock = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    insert: insertMock,
  },
  withRetry: vi.fn((operation: () => Promise<unknown>) => operation()),
}));

import { upsertConversation } from "@/db/queries/conversations";

describe("upsertConversation", () => {
  beforeEach(() => {
    insertMock.mockReset();
    onConflictDoUpdateMock.mockReset();
    returningMock.mockReset();
    valuesMock.mockReset();

    insertMock.mockReturnValue({
      values: valuesMock,
    });
    valuesMock.mockReturnValue({
      onConflictDoUpdate: onConflictDoUpdateMock,
    });
    onConflictDoUpdateMock.mockReturnValue({
      returning: returningMock,
    });
    returningMock.mockResolvedValue([
      {
        id: "conversation-1",
        messages: [],
        productId: null,
        updatedAt: new Date(),
        userId: "user-1",
      },
    ]);
  });

  it("includes productId in conflict updates so existing linkage can be preserved or backfilled", async () => {
    await upsertConversation("conversation-1", "user-1", [], null);

    const config = onConflictDoUpdateMock.mock.calls[0]?.[0];

    expect(config.set).toMatchObject({
      messages: [],
      updatedAt: expect.any(Date),
    });
    expect(config.set.productId).toBeDefined();
    expect(config.set.productId).toHaveProperty("queryChunks");
  });
});
