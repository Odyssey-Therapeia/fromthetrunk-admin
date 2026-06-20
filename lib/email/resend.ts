import { Resend } from "resend";

let instance: Resend | null = null;

export function getResendClient(): Resend {
  if (!instance) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY is not configured.");
    }
    instance = new Resend(apiKey);
  }
  return instance;
}

export const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL || "From the Trunk <hello@fromthetrunk.shop>";
