import { NeonDbError } from "@neondatabase/serverless";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

let withRetry: typeof import("@/db")["withRetry"];

beforeAll(async () => {
  process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/ftt_test";
  ({ withRetry } = await import("@/db"));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("withRetry", () => {
  it("retries when a NeonDbError wraps a transient source error", async () => {
    vi.useFakeTimers();

    const error = new NeonDbError("Failed query");
    error.sourceError = Object.assign(new Error("Connection reset by peer"), {
      code: "ECONNRESET",
    });

    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce("ok");

    const promise = withRetry(operation);
    await Promise.resolve();
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("retries ETIMEDOUT and ErrorEvent-style failures", async () => {
    vi.useFakeTimers();

    const timedOut = Object.assign(new Error("socket timed out"), {
      code: "ETIMEDOUT",
    });
    const errorEvent = Object.assign(new Error("Network connection lost"), {
      name: "ErrorEvent",
    });

    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(timedOut)
      .mockRejectedValueOnce(errorEvent);

    const firstAttempt = withRetry(operation);
    const firstRejection = expect(firstAttempt).rejects.toBe(errorEvent);
    await Promise.resolve();
    await vi.runAllTimersAsync();
    await firstRejection;
    expect(operation).toHaveBeenCalledTimes(2);

    operation.mockReset().mockRejectedValueOnce(errorEvent).mockResolvedValueOnce("ok");

    const secondAttempt = withRetry(operation);
    await Promise.resolve();
    await vi.runAllTimersAsync();
    await expect(secondAttempt).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("does not retry clearly non-transient failures", async () => {
    const error = new Error("Validation failed");
    const operation = vi.fn<() => Promise<string>>().mockRejectedValue(error);

    await expect(withRetry(operation)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("uses the jittered retry delay window", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.999);

    const timeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValueOnce("ok");

    const promise = withRetry(operation);
    await Promise.resolve();

    const delay = timeoutSpy.mock.calls[0]?.[1] as number;

    expect(delay).toBeGreaterThanOrEqual(500);
    expect(delay).toBeLessThanOrEqual(750);

    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe("ok");
  });
});
