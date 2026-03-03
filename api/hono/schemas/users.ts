import { z } from "@hono/zod-openapi";

export const signUpInputSchema = z
  .object({
    email: z.string().trim().email().max(320),
    name: z.string().trim().min(1).max(120),
    password: z
      .string()
      .min(8)
      .max(128)
      .regex(/[A-Z]/)
      .regex(/[a-z]/)
      .regex(/[0-9]/),
  })
  .strict();

export const updateMeInputSchema = z
  .object({
    defaultAddressId: z.string().uuid().nullable().optional(),
    image: z.string().nullable().optional(),
    name: z.string().trim().max(120).optional(),
    phone: z.string().trim().max(40).optional(),
  })
  .strict();
