/**
 * Brand-consistent email templates for From the Trunk.
 * Uses inline styles for maximum email client compatibility.
 */

type EmailOrderItem = {
  name: string;
  price: number;
  quantity: number;
};

type EmailShippingAddress = {
  city?: null | string;
  country?: null | string;
  email?: null | string;
  line1?: null | string;
  line2?: null | string;
  name?: null | string;
  phone?: null | string;
  postalCode?: null | string;
  state?: null | string;
};

type EmailOrder = {
  id: string;
  items: EmailOrderItem[];
  shippingAddress?: EmailShippingAddress | null;
  shippingCost?: number | null;
  subtotal: number;
  taxAmount?: number | null;
  total?: number | null;
};

const brandStyles = {
  bg: "#f5f0e8",
  card: "#ffffff",
  primary: "#6b1d1d",
  gold: "#b8860b",
  text: "#2e2017",
  muted: "#6d5a4e",
  border: "#dccbb7",
};

const formatINR = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);

const wrapper = (content: string) => `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${brandStyles.bg};font-family:'Georgia',serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px;">
    <div style="text-align:center;margin-bottom:24px;">
      <h1 style="font-size:20px;color:${brandStyles.primary};letter-spacing:0.15em;text-transform:uppercase;margin:0;">
        From the Trunk
      </h1>
      <p style="font-size:12px;color:${brandStyles.muted};margin:4px 0 0;letter-spacing:0.1em;">
        Pre-loved luxury sarees with provenance
      </p>
    </div>
    <div style="background:${brandStyles.card};border-radius:16px;padding:32px;border:1px solid ${brandStyles.border};">
      ${content}
    </div>
    <div style="text-align:center;margin-top:24px;font-size:11px;color:${brandStyles.muted};">
      <p>&copy; 2026 From the Trunk. All rights reserved.</p>
      <p>If you have questions, reply to this email or contact us at hello@fromthetrunk.com</p>
    </div>
  </div>
</body>
</html>
`;

export function orderConfirmationEmail(order: EmailOrder): {
  subject: string;
  html: string;
} {
  const orderId = order.id.slice(0, 8).toUpperCase();
  const items = order.items ?? [];

  const itemRows = items
    .map(
      (item: EmailOrderItem) => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid ${brandStyles.border};font-size:14px;color:${brandStyles.text};">
        ${item.name}<br>
        <span style="font-size:12px;color:${brandStyles.muted};">Qty: ${item.quantity}</span>
      </td>
      <td style="padding:8px 0;border-bottom:1px solid ${brandStyles.border};font-size:14px;color:${brandStyles.text};text-align:right;">
        ${formatINR(item.price * item.quantity)}
      </td>
    </tr>
  `
    )
    .join("");

  const address = order.shippingAddress;
  const addressBlock = address
    ? `
    <div style="margin-top:20px;padding:16px;background:${brandStyles.bg};border-radius:12px;">
      <p style="font-size:12px;color:${brandStyles.muted};text-transform:uppercase;letter-spacing:0.1em;margin:0 0 8px;">Shipping to</p>
      <p style="font-size:14px;color:${brandStyles.text};margin:0;line-height:1.6;">
        ${address.name ?? ""}<br>
        ${address.line1 ?? ""}${address.line2 ? `<br>${address.line2}` : ""}<br>
        ${address.city ?? ""}${address.state ? `, ${address.state}` : ""} ${address.postalCode ?? ""}<br>
        ${address.country ?? ""}
      </p>
    </div>
  `
    : "";

  const content = `
    <div style="text-align:center;margin-bottom:24px;">
      <div style="display:inline-block;width:48px;height:48px;background:#e8f5e9;border-radius:50%;line-height:48px;font-size:24px;">✓</div>
      <h2 style="font-size:24px;color:${brandStyles.text};margin:12px 0 4px;">Order Confirmed</h2>
      <p style="font-size:14px;color:${brandStyles.muted};margin:0;">Order #${orderId}</p>
    </div>

    <p style="font-size:14px;color:${brandStyles.muted};line-height:1.6;">
      Thank you for your purchase. Your one-of-a-kind treasure is being prepared with care.
    </p>

    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
      <thead>
        <tr>
          <th style="text-align:left;padding:8px 0;border-bottom:2px solid ${brandStyles.border};font-size:12px;color:${brandStyles.muted};text-transform:uppercase;letter-spacing:0.1em;">Item</th>
          <th style="text-align:right;padding:8px 0;border-bottom:2px solid ${brandStyles.border};font-size:12px;color:${brandStyles.muted};text-transform:uppercase;letter-spacing:0.1em;">Price</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    <div style="margin:16px 0;">
      <div style="display:flex;justify-content:space-between;font-size:14px;color:${brandStyles.muted};margin:4px 0;">
        <span>Subtotal</span><span>${formatINR(order.subtotal)}</span>
      </div>
      ${(order.shippingCost ?? 0) > 0 ? `<div style="display:flex;justify-content:space-between;font-size:14px;color:${brandStyles.muted};margin:4px 0;"><span>Shipping</span><span>${formatINR(order.shippingCost!)}</span></div>` : ""}
      ${(order.taxAmount ?? 0) > 0 ? `<div style="display:flex;justify-content:space-between;font-size:14px;color:${brandStyles.muted};margin:4px 0;"><span>GST</span><span>${formatINR(order.taxAmount!)}</span></div>` : ""}
      <div style="display:flex;justify-content:space-between;font-size:18px;font-weight:bold;color:${brandStyles.text};margin:12px 0;padding-top:12px;border-top:2px solid ${brandStyles.border};">
        <span>Total</span><span>${formatINR(order.total ?? order.subtotal)}</span>
      </div>
    </div>

    ${addressBlock}

    <div style="text-align:center;margin-top:24px;">
      <a href="${process.env.NEXT_PUBLIC_SERVER_URL || "https://fromthetrunk.com"}/account/orders"
         style="display:inline-block;padding:12px 32px;background:${brandStyles.primary};color:#fff;border-radius:100px;text-decoration:none;font-size:14px;">
        View Your Orders
      </a>
    </div>
  `;

  return {
    subject: `Order Confirmed - #${orderId} | From the Trunk`,
    html: wrapper(content),
  };
}

export function orderShippedEmail(
  order: Pick<EmailOrder, "id">,
  trackingNumber?: string
): { subject: string; html: string } {
  const orderId = order.id.slice(0, 8).toUpperCase();

  const content = `
    <div style="text-align:center;margin-bottom:24px;">
      <h2 style="font-size:24px;color:${brandStyles.text};margin:0 0 4px;">Your Order Has Shipped</h2>
      <p style="font-size:14px;color:${brandStyles.muted};margin:0;">Order #${orderId}</p>
    </div>
    <p style="font-size:14px;color:${brandStyles.muted};line-height:1.6;">
      Your saree has been carefully wrapped in muslin and dispatched.
      ${trackingNumber ? `Your tracking number is <strong style="color:${brandStyles.text};">${trackingNumber}</strong>.` : ""}
    </p>
    <div style="text-align:center;margin-top:24px;">
      <a href="${process.env.NEXT_PUBLIC_SERVER_URL || "https://fromthetrunk.com"}/account/orders"
         style="display:inline-block;padding:12px 32px;background:${brandStyles.primary};color:#fff;border-radius:100px;text-decoration:none;font-size:14px;">
        Track Your Order
      </a>
    </div>
  `;

  return {
    subject: `Your Order Has Shipped - #${orderId} | From the Trunk`,
    html: wrapper(content),
  };
}

export function welcomeEmail(name: string): {
  subject: string;
  html: string;
} {
  const content = `
    <div style="text-align:center;margin-bottom:24px;">
      <h2 style="font-size:24px;color:${brandStyles.text};margin:0 0 4px;">Welcome to From the Trunk</h2>
    </div>
    <p style="font-size:14px;color:${brandStyles.muted};line-height:1.6;">
      Hello${name ? ` ${name}` : ""},
    </p>
    <p style="font-size:14px;color:${brandStyles.muted};line-height:1.6;">
      Thank you for joining our community. Each saree in our collection is a
      one-of-a-kind piece with its own story: authenticated, restored, and
      ready for a new chapter.
    </p>
    <p style="font-size:14px;color:${brandStyles.muted};line-height:1.6;">
      Start exploring and discover your next treasure.
    </p>
    <div style="text-align:center;margin-top:24px;">
      <a href="${process.env.NEXT_PUBLIC_SERVER_URL || "https://fromthetrunk.com"}/collection"
         style="display:inline-block;padding:12px 32px;background:${brandStyles.primary};color:#fff;border-radius:100px;text-decoration:none;font-size:14px;">
        Explore the Collection
      </a>
    </div>
  `;

  return {
    subject: "Welcome to From the Trunk",
    html: wrapper(content),
  };
}

export function newsletterConfirmationEmail(confirmUrl: string): {
  subject: string;
  html: string;
} {
  const content = `
    <div style="text-align:center;margin-bottom:24px;">
      <h2 style="font-size:24px;color:${brandStyles.text};margin:0 0 4px;">Confirm Your Subscription</h2>
    </div>
    <p style="font-size:14px;color:${brandStyles.muted};line-height:1.6;">
      You've requested to receive curated drops and stories from the trunk.
      Please confirm your email address to complete your subscription.
    </p>
    <div style="text-align:center;margin-top:24px;">
      <a href="${confirmUrl}"
         style="display:inline-block;padding:12px 32px;background:${brandStyles.primary};color:#fff;border-radius:100px;text-decoration:none;font-size:14px;">
        Confirm Subscription
      </a>
    </div>
    <p style="font-size:12px;color:${brandStyles.muted};margin-top:16px;text-align:center;">
      If you did not request this, you can safely ignore this email.
    </p>
  `;

  return {
    subject: "Confirm your subscription | From the Trunk",
    html: wrapper(content),
  };
}
