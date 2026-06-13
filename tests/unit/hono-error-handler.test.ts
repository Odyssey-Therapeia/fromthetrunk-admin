import { OpenAPIHono } from "@hono/zod-openapi";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onUncaughtError } from "@/lib/http/on-uncaught-error";

const createTestApp = () => {
  const app = new OpenAPIHono();

  app.get("/boom", () => {
    throw new Error("database connection string: postgres://secret/db");
  });

  app.onError(onUncaughtError);

  return app;
};

describe("hono onError handler", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("Test A: returns 500 with generic code and message", async () => {
    const app = createTestApp();
    const response = await app.request("/boom");

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({
      code: "INTERNAL",
      message: "Unexpected server error.",
    });
  });

  it("Test B: calls console.error with the hono prefix", async () => {
    const app = createTestApp();
    await app.request("/boom");

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[hono:v2]",
      expect.any(Error)
    );
  });

  it("Test C: response body does not leak sensitive error details", async () => {
    const app = createTestApp();
    const response = await app.request("/boom");

    const text = await response.text();
    expect(text).not.toContain("postgres");
    expect(text).not.toContain("database");
  });
});
