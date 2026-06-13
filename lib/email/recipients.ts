const DEFAULT_ORDER_NOTIFICATION_EMAILS = [
  "hello@fromthetrunk.com",
  "abraham.boodala@fromthetrunk.shop",
];

export function getOrderNotificationRecipients(): string[] {
  const raw =
    process.env.ORDER_NOTIFICATION_EMAILS || process.env.FTT_ORDER_NOTIFICATION_EMAILS || "";

  const configured = raw
    .split(",")
    .map((recipient) => recipient.trim())
    .filter(Boolean);

  return configured.length > 0 ? configured : DEFAULT_ORDER_NOTIFICATION_EMAILS;
}
