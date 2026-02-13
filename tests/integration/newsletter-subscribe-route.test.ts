import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/payload/server", () => ({
  getPayloadClient: vi.fn(),
}));

vi.mock("@/lib/email/send", () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
}));

import { POST } from "@/app/api/newsletter/subscribe/route";
import { getPayloadClient } from "@/lib/payload/server";

describe("/api/newsletter/subscribe POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects invalid email", async () => {
    const request = new Request("http://localhost/api/newsletter/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "not-an-email" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("creates subscriber and sends confirmation email for new email", async () => {
    const findMock = vi.fn().mockResolvedValue({ docs: [] });
    const createMock = vi.fn().mockResolvedValue({ id: "sub_1" });

    vi.mocked(getPayloadClient).mockResolvedValue({
      find: findMock,
      create: createMock,
    } as unknown as Awaited<ReturnType<typeof getPayloadClient>>);

    const request = new Request("http://localhost/api/newsletter/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "reader@example.com" }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.subscribed).toBe(true);
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "newsletter_subscribers",
        data: expect.objectContaining({
          email: "reader@example.com",
          status: "pending",
        }),
      })
    );
  });

  it("returns success for already-confirmed subscriber", async () => {
    vi.mocked(getPayloadClient).mockResolvedValue({
      find: vi.fn().mockResolvedValue({
        docs: [{ id: "sub_1", email: "reader@example.com", status: "confirmed" }],
      }),
    } as unknown as Awaited<ReturnType<typeof getPayloadClient>>);

    const request = new Request("http://localhost/api/newsletter/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "reader@example.com" }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.message).toContain("already subscribed");
  });
});
