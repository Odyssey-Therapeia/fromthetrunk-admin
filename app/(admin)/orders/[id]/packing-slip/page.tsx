import { notFound } from "next/navigation";

import { formatINR } from "@/db/money";
import { getOrder } from "@/db/queries/orders";

import { PrintControls } from "./print-controls";

type PackingSlipPageProps = {
  params: Promise<{ id: string }>;
};

/**
 * P6-05: Packing slip print view.
 *
 * Admin-facing print-friendly page for a single order.
 * Reads the real order (items, shipping address, order ID).
 * No interactive UI — print CSS only (token-based where possible).
 *
 * Print-specific exception: <style> block uses print media query for page margins.
 * This is unavoidable for print layout; @page rule is not expressible via Tailwind tokens.
 * All color and typography values use CSS variables from the design system.
 */
export default async function PackingSlipPage({ params }: PackingSlipPageProps) {
  const { id } = await params;
  const order = await getOrder(id);

  if (!order) {
    notFound();
  }

  const orderId = order.id.slice(0, 8).toUpperCase();
  const items = order.items ?? [];

  const placedAt = order.placedAt
    ? new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeZone: "Asia/Kolkata",
      }).format(new Date(order.placedAt))
    : "Unknown";

  const shippingLines = [
    order.shippingName,
    order.shippingLine1,
    order.shippingLine2,
    [order.shippingCity, order.shippingState, order.shippingPostalCode].filter(Boolean).join(", "),
    order.shippingCountry,
    order.shippingPhone,
    order.shippingEmail,
  ].filter(Boolean);

  return (
    <>
      {/*
        Print-specific exception: @page margin rule cannot be expressed as a Tailwind token.
        All other values use CSS custom properties from the design system.
      */}
      <style dangerouslySetInnerHTML={{
        __html: `
          @media print {
            @page { margin: 1.5cm; }
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
            .no-print { display: none !important; }
          }
        `
      }} />

      <div className="mx-auto max-w-2xl p-8 font-sans text-foreground">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between border-b border-border pb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Packing Slip
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">From the Trunk</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-foreground">Order #{orderId}</p>
            <p className="text-xs text-muted-foreground">{placedAt}</p>
          </div>
        </div>

        {/* Ship To */}
        <div className="mb-8">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Ship To
          </p>
          <div className="space-y-0.5 text-sm text-foreground">
            {shippingLines.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        </div>

        {/* Items */}
        <div className="mb-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Items
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="pb-2 text-left font-medium text-foreground">Item</th>
                <th className="pb-2 text-center font-medium text-foreground">Qty</th>
                <th className="pb-2 text-right font-medium text-foreground">Price</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-border">
                  <td className="py-2 text-foreground">{item.name}</td>
                  <td className="py-2 text-center text-muted-foreground">{item.quantity}</td>
                  <td className="py-2 text-right text-muted-foreground">
                    {formatINR(item.pricePaise)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="ml-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span>{formatINR(order.subtotalPaise)}</span>
          </div>
          {order.shippingCostPaise > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Shipping ({order.shippingMethod ?? "standard"})</span>
              <span>{formatINR(order.shippingCostPaise)}</span>
            </div>
          )}
          {order.taxAmountPaise > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>GST</span>
              <span>{formatINR(order.taxAmountPaise)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-border pt-2 font-semibold text-foreground">
            <span>Total</span>
            <span>{formatINR(order.totalPaise)}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 border-t border-border pt-6 text-center text-xs text-muted-foreground">
          <p>Thank you for your order.</p>
          <p className="mt-1">From the Trunk — hand-curated vintage sarees</p>
        </div>

        {/* Print controls — client component owns the onClick/window.print() */}
        <PrintControls orderId={id} />
      </div>
    </>
  );
}
