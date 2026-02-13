import { getResendClient, FROM_EMAIL } from "./resend";

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

/**
 * Send a transactional email via Resend.
 *
 * Falls back silently in development when RESEND_API_KEY is not set,
 * logging the email to the console instead.
 */
export async function sendEmail({ to, subject, html }: SendEmailOptions): Promise<boolean> {
  // In development without API key, log to console
  if (!process.env.RESEND_API_KEY) {
    console.log(`[EMAIL] To: ${to} | Subject: ${subject}`);
    console.log(`[EMAIL] (Set RESEND_API_KEY to send real emails)`);
    return true;
  }

  try {
    const resend = getResendClient();
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    });
    return true;
  } catch (error) {
    console.error("[EMAIL] Failed to send:", error);
    return false;
  }
}
