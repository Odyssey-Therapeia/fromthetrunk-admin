import type { ErrorHandler } from "hono";

export const onUncaughtError: ErrorHandler = (error, c) => {
  console.error("[hono:v2]", error);
  return c.json({ code: "INTERNAL", message: "Unexpected server error." }, 500);
};
