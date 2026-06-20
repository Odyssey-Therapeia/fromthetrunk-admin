/**
 * Brand-consistent email templates for From the Trunk.
 * Uses inline styles for maximum email client compatibility.
 */
import { formatINR } from "@/db/money";
import { isGstInclusive } from "@/lib/config/flags";
import { getSiteOrigin } from "@/lib/config/site";

export type EmailOrderItem = {
  name: string;
  price: number;
  quantity: number;
};

export type EmailShippingAddress = {
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

export type EmailOrder = {
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
  primary: "#4b2626",
  gold: "#b8860b",
  text: "#2e2017",
  muted: "#6d5a4e",
  border: "#dccbb7",
};

const escapeHtml = (value: null | string | undefined) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

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
      <p>If you have questions, reply to this email or contact us at hello@fromthetrunk.shop</p>
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
        ${escapeHtml(item.name)}<br>
        <span style="font-size:12px;color:${brandStyles.muted};">Qty: ${item.quantity}</span>
      </td>
      <td style="padding:8px 0;border-bottom:1px solid ${brandStyles.border};font-size:14px;color:${brandStyles.text};text-align:right;">
        ${formatINR(item.price * item.quantity * 100)}
      </td>
    </tr>
  `,
    )
    .join("");

  const address = order.shippingAddress;
  const addressBlock = address
    ? `
    <div style="margin-top:20px;padding:16px;background:${brandStyles.bg};border-radius:12px;">
      <p style="font-size:12px;color:${brandStyles.muted};text-transform:uppercase;letter-spacing:0.1em;margin:0 0 8px;">Shipping to</p>
      <p style="font-size:14px;color:${brandStyles.text};margin:0;line-height:1.6;">
        ${escapeHtml(address.name)}<br>
        ${escapeHtml(address.line1)}${address.line2 ? `<br>${escapeHtml(address.line2)}` : ""}<br>
        ${escapeHtml(address.city)}${address.state ? `, ${escapeHtml(address.state)}` : ""} ${escapeHtml(address.postalCode)}<br>
        ${escapeHtml(address.country)}
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
        <span>Subtotal</span><span>${formatINR(order.subtotal * 100)}</span>
      </div>
      ${(order.shippingCost ?? 0) > 0 ? `<div style="display:flex;justify-content:space-between;font-size:14px;color:${brandStyles.muted};margin:4px 0;"><span>Shipping</span><span>${formatINR(order.shippingCost! * 100)}</span></div>` : ""}
      ${(order.taxAmount ?? 0) > 0 ? `<div style="display:flex;justify-content:space-between;font-size:14px;color:${brandStyles.muted};margin:4px 0;"><span>${isGstInclusive() ? "GST (incl.)" : "GST"}</span><span>${formatINR(order.taxAmount! * 100)}</span></div>` : ""}
      <div style="display:flex;justify-content:space-between;font-size:18px;font-weight:bold;color:${brandStyles.text};margin:12px 0;padding-top:12px;border-top:2px solid ${brandStyles.border};">
        <span>Total${isGstInclusive() ? " (incl. GST)" : ""}</span><span>${formatINR((order.total ?? order.subtotal) * 100)}</span>
      </div>
    </div>

    ${addressBlock}

    <div style="text-align:center;margin-top:24px;">
      <a href="${getSiteOrigin()}/account/orders"
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

export function orderPurchaseNotificationEmail(
  order: EmailOrder,
  payment: {
    paymentId?: null | string;
    paymentMethod?: null | string;
    paymentReference?: null | string;
    paymentUrl?: null | string;
    source: string;
  },
): { subject: string; html: string } {
  const orderId = order.id.slice(0, 8).toUpperCase();
  const address = order.shippingAddress;
  const items = order.items ?? [];
  const itemRows = items
    .map(
      (item) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid ${brandStyles.border};font-size:14px;color:${brandStyles.text};">
            ${escapeHtml(item.name)}<br>
            <span style="font-size:12px;color:${brandStyles.muted};">Qty: ${item.quantity}</span>
          </td>
          <td style="padding:8px 0;border-bottom:1px solid ${brandStyles.border};font-size:14px;color:${brandStyles.text};text-align:right;">
            ${formatINR(item.price * item.quantity * 100)}
          </td>
        </tr>
      `,
    )
    .join("");

  const content = `
    <div style="text-align:center;margin-bottom:24px;">
      <h2 style="font-size:24px;color:${brandStyles.text};margin:0 0 4px;">Paid Order Invoice</h2>
      <p style="font-size:14px;color:${brandStyles.muted};margin:0;">Order #${orderId}</p>
    </div>

    <div style="margin:16px 0;padding:16px;background:${brandStyles.bg};border-radius:12px;">
      <p style="font-size:12px;color:${brandStyles.muted};text-transform:uppercase;letter-spacing:0.1em;margin:0 0 8px;">Customer</p>
      <p style="font-size:14px;color:${brandStyles.text};line-height:1.6;margin:0;">
        ${escapeHtml(address?.name)}<br>
        ${escapeHtml(address?.email)}${address?.phone ? `<br>${escapeHtml(address.phone)}` : ""}
      </p>
    </div>

    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
      <thead>
        <tr>
          <th style="text-align:left;padding:8px 0;border-bottom:2px solid ${brandStyles.border};font-size:12px;color:${brandStyles.muted};text-transform:uppercase;letter-spacing:0.1em;">Item</th>
          <th style="text-align:right;padding:8px 0;border-bottom:2px solid ${brandStyles.border};font-size:12px;color:${brandStyles.muted};text-transform:uppercase;letter-spacing:0.1em;">Amount</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    <div style="margin:16px 0;">
      <div style="display:flex;justify-content:space-between;font-size:14px;color:${brandStyles.muted};margin:4px 0;">
        <span>Subtotal</span><span>${formatINR(order.subtotal * 100)}</span>
      </div>
      ${(order.shippingCost ?? 0) > 0 ? `<div style="display:flex;justify-content:space-between;font-size:14px;color:${brandStyles.muted};margin:4px 0;"><span>Shipping</span><span>${formatINR(order.shippingCost! * 100)}</span></div>` : ""}
      ${(order.taxAmount ?? 0) > 0 ? `<div style="display:flex;justify-content:space-between;font-size:14px;color:${brandStyles.muted};margin:4px 0;"><span>${isGstInclusive() ? "GST (incl.)" : "GST"}</span><span>${formatINR(order.taxAmount! * 100)}</span></div>` : ""}
      <div style="display:flex;justify-content:space-between;font-size:18px;font-weight:bold;color:${brandStyles.text};margin:12px 0;padding-top:12px;border-top:2px solid ${brandStyles.border};">
        <span>Total paid${isGstInclusive() ? " (incl. GST)" : ""}</span><span>${formatINR((order.total ?? order.subtotal) * 100)}</span>
      </div>
    </div>

    <div style="margin-top:20px;padding:16px;background:${brandStyles.bg};border-radius:12px;">
      <p style="font-size:12px;color:${brandStyles.muted};text-transform:uppercase;letter-spacing:0.1em;margin:0 0 8px;">Payment</p>
      <p style="font-size:14px;color:${brandStyles.text};line-height:1.6;margin:0;">
        Source: ${escapeHtml(payment.source)}<br>
        Method: ${escapeHtml(payment.paymentMethod ?? "Razorpay")}<br>
        ${payment.paymentId ? `Payment ID: ${escapeHtml(payment.paymentId)}<br>` : ""}
        ${payment.paymentReference ? `Reference: ${escapeHtml(payment.paymentReference)}<br>` : ""}
        ${payment.paymentUrl ? `Payment link: ${escapeHtml(payment.paymentUrl)}` : ""}
      </p>
    </div>

    ${
      address?.line1
        ? `<div style="margin-top:20px;padding:16px;background:${brandStyles.bg};border-radius:12px;">
            <p style="font-size:12px;color:${brandStyles.muted};text-transform:uppercase;letter-spacing:0.1em;margin:0 0 8px;">Ship to</p>
            <p style="font-size:14px;color:${brandStyles.text};line-height:1.6;margin:0;">
              ${escapeHtml(address.name)}<br>
              ${escapeHtml(address.line1)}${address.line2 ? `<br>${escapeHtml(address.line2)}` : ""}<br>
              ${escapeHtml(address.city)}${address.state ? `, ${escapeHtml(address.state)}` : ""} ${escapeHtml(address.postalCode)}<br>
              ${escapeHtml(address.country)}
            </p>
          </div>`
        : ""
    }
  `;

  return {
    subject: `Paid Order Invoice - #${orderId} | From the Trunk`,
    html: wrapper(content),
  };
}

export function orderShippedEmail(
  order: Pick<EmailOrder, "id">,
  trackingNumber?: string,
): { subject: string; html: string } {
  const orderId = order.id.slice(0, 8).toUpperCase();

  const content = `
    <div style="text-align:center;margin-bottom:24px;">
      <h2 style="font-size:24px;color:${brandStyles.text};margin:0 0 4px;">Your Order Has Shipped</h2>
      <p style="font-size:14px;color:${brandStyles.muted};margin:0;">Order #${orderId}</p>
    </div>
    <p style="font-size:14px;color:${brandStyles.muted};line-height:1.6;">
      Your saree has been carefully wrapped in muslin and dispatched.
      ${trackingNumber ? `Your tracking number is <strong style="color:${brandStyles.text};">${escapeHtml(trackingNumber)}</strong>.` : ""}
    </p>
    <div style="text-align:center;margin-top:24px;">
      <a href="${getSiteOrigin()}/account/orders"
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
      <a href="${getSiteOrigin()}/collection"
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

/**
 * P5-07: Reservation-expiry reminder — transactional service notice.
 *
 * Sent when a customer's hold window expires without payment.
 * Deep-links to the CART (not the dead Razorpay payment link) so the customer
 * can re-initiate checkout if the piece is still available.
 *
 * TRANSACTIONAL ONLY — no marketing copy, no promotions.
 */
export function reservationExpiryReminderEmail(params: {
  itemName: string;
  orderId: string;
}): { subject: string; html: string } {
  const cartUrl = `${getSiteOrigin()}/cart`;
  const shortId = params.orderId.slice(0, 8).toUpperCase();

  const content = `
    <div style="text-align:center;margin-bottom:24px;">
      <h2 style="font-size:22px;color:${brandStyles.text};margin:0 0 4px;">Your Reservation Has Expired</h2>
      <p style="font-size:14px;color:${brandStyles.muted};margin:0;">Order reference: #${escapeHtml(shortId)}</p>
    </div>

    <p style="font-size:14px;color:${brandStyles.muted};line-height:1.7;">
      Your temporary hold on <strong style="color:${brandStyles.text};">${escapeHtml(params.itemName)}</strong>
      has expired — the reservation window has passed without a completed payment.
    </p>

    <p style="font-size:14px;color:${brandStyles.muted};line-height:1.7;">
      The piece may still be available. If you would like to complete your purchase,
      please return to your cart and proceed through checkout again.
    </p>

    <div style="text-align:center;margin-top:28px;">
      <a href="${cartUrl}"
         style="display:inline-block;padding:12px 32px;background:${brandStyles.primary};color:#fff;border-radius:100px;text-decoration:none;font-size:14px;letter-spacing:0.05em;">
        Return to Cart
      </a>
    </div>

    <p style="font-size:12px;color:${brandStyles.muted};margin-top:24px;text-align:center;line-height:1.6;">
      This is a service notice about your recent checkout session on From the Trunk.
      If you did not initiate a checkout, please disregard this email.
    </p>
  `;

  return {
    subject: `Your reservation for ${params.itemName} has expired | From the Trunk`,
    html: wrapper(content),
  };
}

/**
 * P6-01: Email-change verification email.
 *
 * Sent to the NEW email address. The customer must click the link to confirm
 * the address change. The link includes a signed HMAC token.
 */
export function emailChangeVerificationEmail(verifyUrl: string): {
  subject: string;
  html: string;
} {
  const content = `
    <div style="text-align:center;margin-bottom:24px;">
      <h2 style="font-size:24px;color:${brandStyles.text};margin:0 0 4px;">Verify Your New Email Address</h2>
    </div>
    <p style="font-size:14px;color:${brandStyles.muted};line-height:1.6;">
      You recently requested to change the email address on your From the Trunk account.
      Please confirm this new address by clicking the button below.
    </p>
    <div style="text-align:center;margin-top:24px;">
      <a href="${escapeHtml(verifyUrl)}"
         style="display:inline-block;padding:12px 32px;background:${brandStyles.primary};color:#fff;border-radius:100px;text-decoration:none;font-size:14px;">
        Confirm New Email
      </a>
    </div>
    <p style="font-size:12px;color:${brandStyles.muted};margin-top:16px;text-align:center;">
      This link expires in 24 hours. If you did not request an email change, you can safely ignore this email.
    </p>
  `;

  return {
    subject: "Confirm your new email address | From the Trunk",
    html: wrapper(content),
  };
}

/**
 * P6-07: Weekly ops digest email.
 *
 * Composes a structured operations summary from the Control Centre dashboard
 * and formats it as a brand-consistent HTML email.
 */
export function weeklyOpsDigestEmail(
  dashboard: import("@/lib/control-centre/compose-dashboard").ControlCentreDashboard,
): {
  subject: string;
  html: string;
} {
  const { funnel, feedHealth, parity, indexation, cwv, reservationExpiry } =
    dashboard;
  const now = new Date();
  const weekLabel = now.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const content = `
    <div style="text-align:center;margin-bottom:24px;">
      <h2 style="font-size:22px;color:${brandStyles.text};margin:0 0 4px;">Weekly Operations Digest</h2>
      <p style="font-size:13px;color:${brandStyles.muted};margin:0;">Week of ${weekLabel} &mdash; last 30 days</p>
    </div>

    <table style="width:100%;border-collapse:collapse;margin:0 0 20px;">
      <thead>
        <tr>
          <th colspan="2" style="text-align:left;padding:8px 0;border-bottom:2px solid ${brandStyles.border};font-size:12px;color:${brandStyles.muted};text-transform:uppercase;letter-spacing:0.1em;">
            Revenue Funnel
          </th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="padding:6px 0;font-size:14px;color:${brandStyles.muted};">Sessions (GA4)</td>
          <td style="padding:6px 0;font-size:14px;color:${brandStyles.text};text-align:right;font-weight:bold;">${funnel.sessions}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:14px;color:${brandStyles.muted};">Orders Created</td>
          <td style="padding:6px 0;font-size:14px;color:${brandStyles.text};text-align:right;font-weight:bold;">${funnel.ordersCreated}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:14px;color:${brandStyles.muted};">Payments Completed</td>
          <td style="padding:6px 0;font-size:14px;color:${brandStyles.text};text-align:right;font-weight:bold;">${funnel.paid}</td>
        </tr>
      </tbody>
    </table>

    <table style="width:100%;border-collapse:collapse;margin:0 0 20px;">
      <thead>
        <tr>
          <th colspan="2" style="text-align:left;padding:8px 0;border-bottom:2px solid ${brandStyles.border};font-size:12px;color:${brandStyles.muted};text-transform:uppercase;letter-spacing:0.1em;">
            Meta Catalog Health
          </th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="padding:6px 0;font-size:14px;color:${brandStyles.muted};">Catalog Items</td>
          <td style="padding:6px 0;font-size:14px;color:${brandStyles.text};text-align:right;font-weight:bold;">${feedHealth.catalogItemCount}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:14px;color:${brandStyles.muted};">Disapprovals</td>
          <td style="padding:6px 0;font-size:14px;color:${feedHealth.catalogDisapprovals > 0 ? brandStyles.primary : brandStyles.text};text-align:right;font-weight:bold;">${feedHealth.catalogDisapprovals}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:14px;color:${brandStyles.muted};">Pixel / CAPI Parity</td>
          <td style="padding:6px 0;font-size:14px;color:${brandStyles.text};text-align:right;font-weight:bold;">${parity.pixelEventCount} / ${parity.capiEventCount} (delta: ${parity.parityDelta > 0 ? "+" : ""}${parity.parityDelta})</td>
        </tr>
      </tbody>
    </table>

    <table style="width:100%;border-collapse:collapse;margin:0 0 20px;">
      <thead>
        <tr>
          <th colspan="2" style="text-align:left;padding:8px 0;border-bottom:2px solid ${brandStyles.border};font-size:12px;color:${brandStyles.muted};text-transform:uppercase;letter-spacing:0.1em;">
            Search &amp; Core Web Vitals
          </th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="padding:6px 0;font-size:14px;color:${brandStyles.muted};">Indexed Pages (GSC)</td>
          <td style="padding:6px 0;font-size:14px;color:${brandStyles.text};text-align:right;font-weight:bold;">${indexation.indexedPageCount}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:14px;color:${brandStyles.muted};">Avg CTR</td>
          <td style="padding:6px 0;font-size:14px;color:${brandStyles.text};text-align:right;font-weight:bold;">${(indexation.avgCtr * 100).toFixed(1)}%</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:14px;color:${brandStyles.muted};">LCP p75</td>
          <td style="padding:6px 0;font-size:14px;color:${brandStyles.text};text-align:right;font-weight:bold;">${cwv.lcp.toFixed(2)}s</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:14px;color:${brandStyles.muted};">INP p75</td>
          <td style="padding:6px 0;font-size:14px;color:${brandStyles.text};text-align:right;font-weight:bold;">${cwv.inp}ms</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:14px;color:${brandStyles.muted};">CLS p75</td>
          <td style="padding:6px 0;font-size:14px;color:${brandStyles.text};text-align:right;font-weight:bold;">${cwv.cls.toFixed(3)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:14px;color:${brandStyles.muted};">Recent Deploys</td>
          <td style="padding:6px 0;font-size:14px;color:${brandStyles.text};text-align:right;font-weight:bold;">${cwv.recentDeployCount}</td>
        </tr>
      </tbody>
    </table>

    <table style="width:100%;border-collapse:collapse;margin:0 0 20px;">
      <thead>
        <tr>
          <th colspan="2" style="text-align:left;padding:8px 0;border-bottom:2px solid ${brandStyles.border};font-size:12px;color:${brandStyles.muted};text-transform:uppercase;letter-spacing:0.1em;">
            Reservations
          </th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="padding:6px 0;font-size:14px;color:${brandStyles.muted};">Created</td>
          <td style="padding:6px 0;font-size:14px;color:${brandStyles.text};text-align:right;font-weight:bold;">${reservationExpiry.reservationsCreated}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:14px;color:${brandStyles.muted};">Expired (30d)</td>
          <td style="padding:6px 0;font-size:14px;color:${brandStyles.text};text-align:right;font-weight:bold;">${reservationExpiry.expiredCount}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:14px;color:${brandStyles.muted};">Expiry Rate</td>
          <td style="padding:6px 0;font-size:14px;color:${brandStyles.text};text-align:right;font-weight:bold;">${(reservationExpiry.expiryRate * 100).toFixed(1)}%</td>
        </tr>
      </tbody>
    </table>

    <p style="font-size:12px;color:${brandStyles.muted};margin-top:16px;text-align:center;">
      Auto-generated by From the Trunk Operations Digest. Data reflects the last 30 days.
    </p>
  `;

  return {
    subject: `Weekly Ops Digest — ${weekLabel} | From the Trunk`,
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
