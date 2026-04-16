import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const anthropicMock = vi.hoisted(() => vi.fn(() => "anthropic-model"));
const convertToModelMessagesMock = vi.hoisted(() => vi.fn(async () => []));
const getConversationByIdMock = vi.hoisted(() => vi.fn());
const getServerAuthSessionMock = vi.hoisted(() => vi.fn());
const safeValidateUIMessagesMock = vi.hoisted(() => vi.fn());
const stepCountIsMock = vi.hoisted(() => vi.fn(() => "stop-after-25"));
const streamTextMock = vi.hoisted(() => vi.fn());
const upsertConversationMock = vi.hoisted(() => vi.fn());

vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: anthropicMock,
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();

  return {
    ...actual,
    convertToModelMessages: convertToModelMessagesMock,
    safeValidateUIMessages: safeValidateUIMessagesMock,
    stepCountIs: stepCountIsMock,
    streamText: streamTextMock,
  };
});

vi.mock("@/lib/auth/get-session", () => ({
  getServerAuthSession: getServerAuthSessionMock,
}));

vi.mock("@/db/queries/conversations", () => ({
  getConversationById: getConversationByIdMock,
  upsertConversation: upsertConversationMock,
}));

let POST: typeof import("@/app/api/chat/route")["POST"];

const VALIDATED_MESSAGES = [
  {
    parts: [
      {
        text: "Help me draft a story.",
        type: "text",
      },
    ],
    role: "user",
  },
];

describe("POST /api/chat", () => {
  beforeEach(async () => {
    process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/ftt_test";
    POST ??= (await import("@/app/api/chat/route")).POST;
  });

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";

    anthropicMock.mockClear();
    convertToModelMessagesMock.mockClear();
    getConversationByIdMock.mockReset();
    getServerAuthSessionMock.mockReset();
    safeValidateUIMessagesMock.mockReset();
    stepCountIsMock.mockClear();
    streamTextMock.mockReset();
    upsertConversationMock.mockReset();

    getServerAuthSessionMock.mockResolvedValue({
      user: {
        id: "admin-1",
        role: "admin",
      },
    });
    safeValidateUIMessagesMock.mockResolvedValue({
      data: VALIDATED_MESSAGES,
      success: true,
    });
    streamTextMock.mockImplementation((options: { onFinish?: () => Promise<void> | void }) => {
      void options.onFinish?.();
      return {
        toUIMessageStreamResponse: () => new Response(null, { status: 200 }),
      };
    });
    upsertConversationMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.DATABASE_URL;
  });

  it("returns 400 for invalid JSON", async () => {
    const response = await POST(
      new Request("http://localhost/api/chat", {
        body: "{",
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_JSON",
    });
  });

  it("returns 400 for an invalid request body", async () => {
    const response = await POST(
      new Request("http://localhost/api/chat", {
        body: JSON.stringify({
          messages: "not-an-array",
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_REQUEST",
    });
  });

  it("returns 400 when message validation fails", async () => {
    safeValidateUIMessagesMock.mockResolvedValue({
      success: false,
      error: { message: "Invalid message format" },
    });

    const response = await POST(
      new Request("http://localhost/api/chat", {
        body: JSON.stringify({
          messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }],
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_MESSAGES",
    });
  });

  it("returns 403 when the conversation belongs to another user", async () => {
    const conversationId = "11111111-1111-4111-8111-111111111111";

    getConversationByIdMock.mockResolvedValue({
      id: conversationId,
      userId: "someone-else",
    });

    const response = await POST(
      new Request("http://localhost/api/chat", {
        body: JSON.stringify({
          conversationId,
          formContext: {
            currentStep: "Story",
            uploadedImageCount: 1,
            uploadedImageFilenames: ["saree.jpg"],
            values: {},
          },
          messages: [],
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("allows same-user conversation updates and persists product linkage", async () => {
    const conversationId = "22222222-2222-4222-8222-222222222222";
    const productId = "33333333-3333-4333-8333-333333333333";

    getConversationByIdMock.mockResolvedValue({
      id: conversationId,
      userId: "admin-1",
    });

    const response = await POST(
      new Request("http://localhost/api/chat", {
        body: JSON.stringify({
          conversationId,
          formContext: {
            currentStep: "Story",
            uploadedImageCount: 2,
            uploadedImageFilenames: ["one.jpg", "two.jpg"],
            values: {
              storyTitle: "Temple Border Silk",
            },
          },
          messages: [],
          productId,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      })
    );

    await Promise.resolve();

    expect(response.status).toBe(200);
    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        providerOptions: {
          anthropic: {
            effort: "medium",
            thinking: { type: "adaptive" },
          },
        },
      })
    );
    expect(upsertConversationMock).toHaveBeenCalledWith(
      conversationId,
      "admin-1",
      VALIDATED_MESSAGES,
      productId,
      expect.any(String)
    );
  });
});
