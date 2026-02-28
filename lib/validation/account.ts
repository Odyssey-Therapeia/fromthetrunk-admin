import { z } from "zod";

export const profilePatchSchema = z
  .object({
    defaultAddress: z.string().min(1).nullable().optional(),
    name: z.string().trim().max(120).optional(),
    phone: z.string().trim().max(40).optional(),
  })
  .strict()
  .refine((value) => value.name !== undefined || value.phone !== undefined || value.defaultAddress !== undefined, {
    message: "At least one field must be provided.",
    path: ["name"],
  });

const addressBaseSchema = z
  .object({
    city: z.string().trim().min(1).max(120),
    country: z.string().trim().min(1).max(120),
    isDefault: z.boolean().optional().default(false),
    label: z.string().trim().max(80).optional().default(""),
    line1: z.string().trim().min(1).max(180),
    line2: z.string().trim().max(180).optional().default(""),
    name: z.string().trim().max(120).optional().default(""),
    phone: z.string().trim().max(40).optional().default(""),
    postalCode: z.string().trim().min(1).max(40),
    state: z.string().trim().max(120).optional().default(""),
  })
  .strict();

export const addressCreateSchema = addressBaseSchema;

export const customerSignUpSchema = z
  .object({
    email: z.string().trim().email().max(320),
    name: z.string().trim().min(1).max(120),
    password: z
      .string()
      .min(8)
      .max(128)
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter.")
      .regex(/[a-z]/, "Password must contain at least one lowercase letter.")
      .regex(/[0-9]/, "Password must contain at least one number."),
  })
  .strict();

export const addressUpdateSchema = z
  .object({
    city: z.string().trim().min(1).max(120).optional(),
    country: z.string().trim().min(1).max(120).optional(),
    isDefault: z.boolean().optional(),
    label: z.string().trim().max(80).optional(),
    line1: z.string().trim().min(1).max(180).optional(),
    line2: z.string().trim().max(180).optional(),
    name: z.string().trim().max(120).optional(),
    phone: z.string().trim().max(40).optional(),
    postalCode: z.string().trim().min(1).max(40).optional(),
    state: z.string().trim().max(120).optional(),
  })
  .strict()
  .refine((value) => {
    return Object.keys(value).length > 0;
  }, "At least one field must be provided.");

export type AddressCreateInput = z.infer<typeof addressCreateSchema>;
export type AddressUpdateInput = z.infer<typeof addressUpdateSchema>;
export type CustomerSignUpInput = z.infer<typeof customerSignUpSchema>;
export type ProfilePatchInput = z.infer<typeof profilePatchSchema>;
