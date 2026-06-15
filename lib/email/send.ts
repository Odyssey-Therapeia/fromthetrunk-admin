import { getResendClient, FROM_EMAIL } from "./resend";
import { createLogger } from "@/lib/log";

const log = createLogger("email:send");

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
}

const normalizeRecipients = (to: string | string[]) =>
  (Array.isArray(to) ? to : [to])
    .map((recipient) => recipient.trim())
    .filter(Boolean);

const hasSmtpConfig = () =>
  Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);

const getSmtpPort = () => {
  const rawPort = process.env.SMTP_PORT;
  if (!rawPort) return 465;

  const port = Number(rawPort);
  return Number.isFinite(port) ? port : 465;
};

const getSmtpFrom = () =>
  process.env.SMTP_FROM_EMAIL ||
  process.env.RESEND_FROM_EMAIL ||
  (process.env.SMTP_USER ? `From the Trunk <${process.env.SMTP_USER}>` : FROM_EMAIL);

/**
 * Send a transactional email via Resend.
 *
 * Falls back to SMTP when configured, then console logging in development.
 */
export async function sendEmail({ to, subject, html }: SendEmailOptions): Promise<boolean> {
  const recipients = normalizeRecipients(to);
  if (recipients.length === 0) return false;

  try {
    if (process.env.RESEND_API_KEY) {
      const resend = getResendClient();
      const { error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: recipients,
        subject,
        html,
      });
      if (error) {
        log.error("Resend error", { message: error.message });
        return false;
      }
      return true;
    }

    if (hasSmtpConfig()) {
      const { default: nodemailer } = await import("nodemailer");
      const port = getSmtpPort();
      const transporter = nodemailer.createTransport({
        auth: {
          pass: process.env.SMTP_PASSWORD,
          user: process.env.SMTP_USER,
        },
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
      });

      await transporter.sendMail({
        from: getSmtpFrom(),
        html,
        subject,
        to: recipients.join(", "),
      });
      return true;
    }

    log.info("Dev mock: email not sent (no transport configured)", {
      to: recipients.join(", "),
      subject,
      hint: "Set RESEND_API_KEY or SMTP_* vars to send real emails",
    });
    return true;
  } catch (error) {
    log.error("Failed to send email", { err: error as Record<string, unknown> });
    return false;
  }
}
