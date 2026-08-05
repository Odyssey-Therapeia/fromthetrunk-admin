import { z } from "@hono/zod-openapi";

/**
 * Schemas for the one-time Google Merchant developer-registration endpoint.
 *
 * The confirmation phrase is a deliberate speed bump: the endpoint performs an
 * irreversible, account-level Google side effect, so an accidental POST with an
 * empty body must not trigger it.
 */
export const REGISTER_GCP_CONFIRMATION = "REGISTER_FTT_MERCHANT_GCP" as const;

/** Strict: any unexpected key is rejected rather than ignored. */
export const registerGcpRequestSchema = z.strictObject({
  confirm: z.literal(REGISTER_GCP_CONFIRMATION),
});

export type RegisterGcpRequest = z.infer<typeof registerGcpRequestSchema>;

/**
 * The ONLY fields the endpoint is allowed to emit on success.
 *
 * The handler parses its response body through this schema before sending it,
 * so no field of the upstream Google payload (and no credential material) can
 * reach the client by accident.
 */
export const registerGcpResponseSchema = z.strictObject({
  registered: z.literal(true),
  name: z.string(),
  gcpIds: z.array(z.string()),
  alreadyRegistered: z.boolean(),
});

export type RegisterGcpResponse = z.infer<typeof registerGcpResponseSchema>;
