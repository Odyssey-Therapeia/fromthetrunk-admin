import type { Context, MiddlewareHandler } from "hono";

import type { HonoBindings } from "../types";
import { requireAdmin } from "./auth";

export const adminMiddleware: MiddlewareHandler<HonoBindings> = async (
  c: Context<HonoBindings>,
  next
) => {
  const authUserOrResponse = requireAdmin(c);
  if (authUserOrResponse instanceof Response) {
    return authUserOrResponse;
  }

  await next();
};
