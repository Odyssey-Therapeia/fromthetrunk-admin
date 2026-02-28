import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/payload/server", () => ({
  getPayloadClient: vi.fn(),
}));

vi.mock("@/lib/email/send", () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
}));

import { POST } from "@/app/api/account/sign-up/route";
import { sendEmail } from "@/lib/email/send";
import { getPayloadClient } from "@/lib/payload/server";

describe("/api/account/sign-up POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects invalid payload", async () => {
    const request = new Request("http://localhost/api/account/sign-up", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "203.0.113.31",
      },
      body: JSON.stringify({
        email: "reader@example.com",
        name: "Reader",
        password: "short",
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it("returns conflict when email already exists", async () => {
    const findMock = vi.fn().mockResolvedValue({
      docs: [{ id: "u1", email: "reader@example.com" }],
    });

    vi.mocked(getPayloadClient).mockResolvedValue({
      find: findMock,
      create: vi.fn(),
    } as unknown as Awaited<ReturnType<typeof getPayloadClient>>);

    const request = new Request("http://localhost/api/account/sign-up", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "203.0.113.32",
      },
      body: JSON.stringify({
        email: "reader@example.com",
        name: "Reader",
        password: "StrongPass1",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("EMAIL_ALREADY_REGISTERED");
  });

  it("creates a customer account and sends welcome email", async () => {
    const findMock = vi.fn().mockResolvedValue({ docs: [] });
    const createMock = vi.fn().mockResolvedValue({ id: "u2" });

    vi.mocked(getPayloadClient).mockResolvedValue({
      find: findMock,
      create: createMock,
    } as unknown as Awaited<ReturnType<typeof getPayloadClient>>);

    const request = new Request("http://localhost/api/account/sign-up", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "203.0.113.33",
      },
      body: JSON.stringify({
        email: " Reader@Example.com ",
        name: "Reader Example",
        password: "StrongPass1",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.created).toBe(true);
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "users",
        data: expect.objectContaining({
          email: "reader@example.com",
          name: "Reader Example",
          role: "customer",
          password: "StrongPass1",
        }),
      })
    );
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});
