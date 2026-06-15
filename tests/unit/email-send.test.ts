import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const emailsSendMock = vi.hoisted(() => vi.fn());
const getResendClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/email/resend", () => ({
  FROM_EMAIL: "From the Trunk <hello@fromthetrunk.com>",
  getResendClient: getResendClientMock,
}));

// Mock the logger to capture log.error calls
const logErrorMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/log", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: logErrorMock,
  }),
}));

import { sendEmail } from "@/lib/email/send";

describe("sendEmail (Resend path)", () => {
  beforeEach(() => {
    emailsSendMock.mockReset();
    getResendClientMock.mockReset();
    logErrorMock.mockReset();
    getResendClientMock.mockReturnValue({
      emails: { send: emailsSendMock },
    });
    process.env.RESEND_API_KEY = "re_test_key";
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
  });

  it("returns false and logs when Resend returns an error", async () => {
    emailsSendMock.mockResolvedValue({
      data: null,
      error: { message: "domain not verified" },
    });

    const result = await sendEmail({
      to: "customer@example.com",
      subject: "Test",
      html: "<p>Hello</p>",
    });

    expect(result).toBe(false);
    expect(logErrorMock).toHaveBeenCalledWith(
      "Resend error",
      expect.objectContaining({ message: "domain not verified" })
    );
  });

  it("returns true when Resend returns data without an error", async () => {
    emailsSendMock.mockResolvedValue({
      data: { id: "msg_abc123" },
      error: null,
    });

    const result = await sendEmail({
      to: "customer@example.com",
      subject: "Test",
      html: "<p>Hello</p>",
    });

    expect(result).toBe(true);
    expect(logErrorMock).not.toHaveBeenCalled();
    expect(emailsSendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["customer@example.com"],
        subject: "Test",
      })
    );
  });
});
