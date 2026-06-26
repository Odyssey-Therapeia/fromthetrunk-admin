import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { formatINR } from "@/db/money";
import { getOrder } from "@/db/queries/orders";

import { PrintControls } from "./print-controls";

type PurchaseSlipPageProps = {
  params: Promise<{ id: string }>;
};

const formatDate = (value: Date | string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeZone: "Asia/Kolkata",
      }).format(new Date(value))
    : "Unknown";

const compactOrderId = (id: string) => id.slice(0, 8).toUpperCase();

export async function generateMetadata({
  params,
}: PurchaseSlipPageProps): Promise<Metadata> {
  const { id } = await params;
  const order = await getOrder(id);
  const orderId = order ? compactOrderId(order.id) : compactOrderId(id);

  return {
    title: `Purchase Slip ${orderId} - From The Trunk`,
  };
}

export default async function PurchaseSlipPage({
  params,
}: PurchaseSlipPageProps) {
  const { id } = await params;
  const order = await getOrder(id);

  if (!order) {
    notFound();
  }

  const orderId = compactOrderId(order.id);
  const items = order.items ?? [];

  const computedSubtotalPaise = items.reduce(
    (sum, item) => sum + item.pricePaise * item.quantity,
    0,
  );

  const subtotalPaise = order.subtotalPaise ?? computedSubtotalPaise;
  const taxAmountPaise = order.taxAmountPaise ?? 0;
  const shippingCostPaise =
    order.shippingCostPaise ??
    Math.max(order.totalPaise - subtotalPaise - taxAmountPaise, 0);

  const orderDate = formatDate(order.placedAt ?? order.createdAt);

  const shippingLocation = [
    order.shippingCity,
    order.shippingState,
    order.shippingPostalCode,
  ]
    .filter(Boolean)
    .join(", ");

  const shippingLines = [
    order.shippingLine1,
    order.shippingLine2,
    shippingLocation,
    order.shippingCountry,
  ].filter(Boolean);

  const contactLines = [order.shippingPhone, order.shippingEmail].filter(
    Boolean,
  );

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              @page {
                margin: 1.5cm;
                size: A4;
              }

              html,
              body {
                background: #ffffff !important;
              }

              body {
                print-color-adjust: exact;
                -webkit-print-color-adjust: exact;
              }

              body * {
                visibility: hidden !important;
              }

              .purchase-slip-print-root,
              .purchase-slip-print-root * {
                visibility: visible !important;
              }

              .purchase-slip-print-root {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                max-width: none !important;
                margin: 0 !important;
                padding: 0 !important;
              }

              .purchase-slip-card {
                border: none !important;
                box-shadow: none !important;
                padding: 0 !important;
              }

              .no-print {
                display: none !important;
              }
            }
          `,
        }}
      />

      <div className="purchase-slip-print-root mx-auto max-w-3xl p-8 font-sans text-foreground">
        <div className="no-print mb-6">
          <PrintControls orderId={id} orderNumber={orderId} />
        </div>

        <div className="purchase-slip-card rounded-2xl border border-border/70 bg-card p-8 shadow-sm">
          <header className="flex flex-col gap-6 border-b border-border pb-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-muted-foreground">
                From the Trunk
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
                Purchase Slip
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Hand-curated vintage sarees
              </p>
            </div>

            <div className="space-y-2 text-left sm:text-right">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Order
                </p>
                <p className="mt-1 text-lg font-semibold text-foreground">
                  #{orderId}
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Date
                </p>
                <p className="mt-1 text-sm text-foreground">{orderDate}</p>
              </div>
            </div>
          </header>

          <section className="grid gap-6 border-b border-border py-6 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Customer
              </p>

              <div className="mt-3 space-y-1 text-sm text-foreground">
                <p className="font-medium">
                  {order.shippingName ?? "No customer name"}
                </p>

                {contactLines.length > 0 ? (
                  contactLines.map((line, index) => <p key={index}>{line}</p>)
                ) : (
                  <p className="text-muted-foreground">No contact details.</p>
                )}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Ship to
              </p>

              <div className="mt-3 space-y-1 text-sm text-foreground">
                {shippingLines.length > 0 ? (
                  shippingLines.map((line, index) => <p key={index}>{line}</p>)
                ) : (
                  <p className="text-muted-foreground">No shipping address.</p>
                )}
              </div>
            </div>
          </section>

          <section className="py-6">
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Items purchased
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Customer-facing order summary.
                </p>
              </div>

              <p className="text-sm font-medium text-foreground">
                {items.length} line item{items.length === 1 ? "" : "s"}
              </p>
            </div>

            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-left font-medium text-foreground">
                      Item
                    </th>
                    <th className="w-20 px-4 py-3 text-center font-medium text-foreground">
                      Qty
                    </th>
                    <th className="w-32 px-4 py-3 text-right font-medium text-foreground">
                      Amount
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {items.length > 0 ? (
                    items.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-border last:border-0"
                      >
                        <td className="px-4 py-4 text-foreground">
                          <p className="font-medium">{item.name}</p>
                        </td>
                        <td className="px-4 py-4 text-center text-foreground">
                          {item.quantity}
                        </td>
                        <td className="px-4 py-4 text-right text-muted-foreground">
                          {formatINR(item.pricePaise * item.quantity)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        className="px-4 py-6 text-center text-sm text-muted-foreground"
                        colSpan={3}
                      >
                        No items recorded.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid gap-6 border-t border-border pt-6 sm:grid-cols-[1fr_18rem]">
            <div className="rounded-xl border border-dashed border-border/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Note
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                This purchase slip confirms the order summary for the customer.
                Please retain it for your records.
              </p>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{formatINR(subtotalPaise)}</span>
              </div>

              {shippingCostPaise > 0 ? (
                <div className="flex justify-between text-muted-foreground">
                  <span>Shipping ({order.shippingMethod ?? "standard"})</span>
                  <span>{formatINR(shippingCostPaise)}</span>
                </div>
              ) : null}

              {taxAmountPaise > 0 ? (
                <div className="flex justify-between text-muted-foreground">
                  <span>GST</span>
                  <span>{formatINR(taxAmountPaise)}</span>
                </div>
              ) : null}

              <div className="flex justify-between border-t border-border pt-3 text-base font-semibold text-foreground">
                <span>Total</span>
                <span>{formatINR(order.totalPaise)}</span>
              </div>
            </div>
          </section>

          <footer className="mt-10 border-t border-border pt-6 text-center text-xs text-muted-foreground">
            <p>Thank you for your order.</p>
            <p className="mt-1">From the Trunk — hand-curated vintage sarees</p>
          </footer>
        </div>
      </div>
    </>
  );
}
