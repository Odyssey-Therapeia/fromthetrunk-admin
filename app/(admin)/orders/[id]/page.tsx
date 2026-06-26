import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronDown, Printer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatINR } from "@/db/money";
import { getOrder } from "@/db/queries/orders";

import { OrderStatusEditor } from "./order-status-editor";

type AdminOrderDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

type EventPayload = null | Record<string, unknown>;

type DetailBlockProps = {
  children: ReactNode;
  label: string;
  mono?: boolean;
  tone?: "default" | "danger" | "muted";
};

type SummaryTileProps = {
  children?: ReactNode;
  hint?: ReactNode;
  label: string;
  value: ReactNode;
};

const formatDateTime = (value: Date | string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kolkata",
      }).format(new Date(value))
    : "Unknown";

const badgeClassName = (status: string) => {
  switch (status) {
    case "confirmed":
    case "delivered":
    case "paid":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "failed":
    case "refunded":
      return "border-red-200 bg-red-50 text-red-800";
    case "shipped":
      return "border-blue-200 bg-blue-50 text-blue-800";
    default:
      return "border-amber-200 bg-amber-50 text-amber-800";
  }
};

const payloadSummary = (payload: EventPayload) => {
  if (!payload || typeof payload !== "object") return null;

  const paymentId =
    typeof payload.paymentId === "string" ? payload.paymentId : null;
  const paymentReference =
    typeof payload.paymentReference === "string"
      ? payload.paymentReference
      : null;
  const paymentLinkId =
    typeof payload.paymentLinkId === "string" ? payload.paymentLinkId : null;

  return (
    [paymentId, paymentReference, paymentLinkId].filter(Boolean).join(" | ") ||
    null
  );
};

function SummaryTile({ children, hint, label, value }: SummaryTileProps) {
  if (children) {
    return (
      <details className="group rounded-xl border border-border/70 bg-card p-4 shadow-sm">
        <summary className="list-none cursor-pointer [&::-webkit-details-marker]:hidden">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {label}
              </p>
              <div className="mt-2 text-base font-semibold text-foreground">
                {value}
              </div>
              {hint ? (
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {hint}
                </p>
              ) : null}
            </div>

            <div className="mt-1 rounded-full border border-border/70 bg-background/70 p-1 text-muted-foreground transition group-open:rotate-180">
              <ChevronDown className="h-3.5 w-3.5" />
            </div>
          </div>

          <p className="mt-3 text-xs font-medium text-muted-foreground">
            Click to {children ? "view details" : "expand"}
          </p>
        </summary>

        <div className="mt-4 space-y-4 border-t border-border/70 pt-4">
          {children}
        </div>
      </details>
    );
  }

  return (
    <div className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
      <div className="mt-2 text-base font-semibold text-foreground">
        {value}
      </div>
      {hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function DetailBlock({
  children,
  label,
  mono = false,
  tone = "default",
}: DetailBlockProps) {
  const valueClassName =
    tone === "danger"
      ? "text-red-600"
      : tone === "muted"
        ? "text-muted-foreground"
        : "text-foreground";

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <div
        className={`mt-1 break-words text-sm ${valueClassName} ${
          mono ? "font-mono text-xs" : ""
        }`}
      >
        {children}
      </div>
    </div>
  );
}

export default async function AdminOrderDetailPage({
  params,
}: AdminOrderDetailPageProps) {
  const { id } = await params;
  const order = await getOrder(id);

  if (!order) {
    notFound();
  }

  const items = order.items ?? [];
  const events = order.events ?? [];

  const computedSubtotalPaise = items.reduce(
    (sum, item) => sum + item.pricePaise * item.quantity,
    0,
  );
  const subtotalPaise = order.subtotalPaise || computedSubtotalPaise;
  const taxAmountPaise = order.taxAmountPaise ?? 0;
  const shippingPaise = Math.max(
    order.totalPaise - subtotalPaise - taxAmountPaise,
    0,
  );

  const orderNumber = order.id.slice(0, 8).toUpperCase();
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const purchasedItemSummary =
    items.length > 0
      ? items.map((item) => `${item.name} ×${item.quantity}`).join(", ")
      : "No items recorded";

  const shippingLocation = [
    order.shippingCity,
    order.shippingState,
    order.shippingPostalCode,
  ]
    .filter(Boolean)
    .join(", ");

  const hasShipmentDetails = Boolean(
    order.trackingNumber || order.trackingCarrier,
  );
  const hasRefundDetails = Boolean(
    order.refundId || order.refundedAt || order.refundedAmountPaise,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-4">
          <Button asChild size="sm" variant="ghost">
            <Link href="/orders">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to orders
            </Link>
          </Button>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-semibold tracking-tight">
                Order #{orderNumber}
              </h2>
              <Badge className={badgeClassName(order.status)} variant="outline">
                {order.status}
              </Badge>
              <Badge
                className={badgeClassName(order.paymentStatus)}
                variant="outline"
              >
                {order.paymentStatus}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Created {formatDateTime(order.createdAt)} · Updated{" "}
              {formatDateTime(order.updatedAt)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={`/orders/${order.id}/packing-slip`} target="_blank">
              <Printer className="mr-1 h-3.5 w-3.5" />
              Packing slip
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryTile
          label="Customer"
          value={order.shippingName ?? "No name"}
          hint={order.shippingEmail ?? order.shippingPhone ?? "No contact"}
        >
          <DetailBlock label="Name">
            {order.shippingName ?? "No customer name"}
          </DetailBlock>

          <DetailBlock label="Email">
            {order.shippingEmail ?? "No email"}
          </DetailBlock>

          <DetailBlock label="Phone">
            {order.shippingPhone ?? "No phone"}
          </DetailBlock>

          <Separator />

          <DetailBlock label="Ship to">
            <div className="space-y-1">
              <p>{order.shippingLine1 ?? "No address line 1"}</p>
              {order.shippingLine2 ? <p>{order.shippingLine2}</p> : null}
              <p className="text-muted-foreground">
                {shippingLocation || "No city/state/postal code"}
              </p>
              <p className="text-muted-foreground">
                {order.shippingCountry ?? "No country"}
              </p>
            </div>
          </DetailBlock>
        </SummaryTile>

        <SummaryTile
          label="Items"
          value={
            <span className="line-clamp-2 block leading-snug">
              {purchasedItemSummary}
            </span>
          }
          hint={`${itemCount} item${itemCount === 1 ? "" : "s"} · ${
            items.length
          } line item${items.length === 1 ? "" : "s"}`}
        />

        <SummaryTile
          label="Payment"
          value={order.paymentStatus}
          hint={order.paymentMethod ?? order.paymentGateway ?? "No method"}
        >
          <DetailBlock label="Gateway">
            {order.paymentGateway ?? "-"}
          </DetailBlock>

          <DetailBlock label="Method">{order.paymentMethod ?? "-"}</DetailBlock>

          <DetailBlock label="Payment ID" mono>
            {order.paymentId ?? "-"}
          </DetailBlock>

          <DetailBlock label="Razorpay ref" mono>
            {order.razorpayOrderId ?? "-"}
          </DetailBlock>

          {order.refundId ? (
            <DetailBlock label="Refund ID" mono tone="danger">
              {order.refundId}
            </DetailBlock>
          ) : null}

          {order.refundedAt ? (
            <DetailBlock label="Refunded at">
              {formatDateTime(order.refundedAt)}
            </DetailBlock>
          ) : null}
        </SummaryTile>

        <SummaryTile
          label="Order total"
          value={formatINR(order.totalPaise)}
          hint={
            hasRefundDetails && order.refundedAmountPaise
              ? `Refunded ${formatINR(order.refundedAmountPaise)}`
              : "Inclusive of shipping and GST"
          }
        />
      </div>

      <div className="grid gap-4">
        <Card className="border-border/70 bg-card shadow-sm">
          <CardHeader>
            <CardTitle>Items purchased</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {items.length > 0 ? (
              items.map((item) => (
                <div
                  className="flex flex-col gap-3 rounded-xl border border-border/70 bg-background/60 p-4 sm:flex-row sm:items-center sm:justify-between"
                  key={item.id}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{item.name}</p>
                    {item.productId ? (
                      <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                        {item.productId}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">
                        No linked product ID
                      </p>
                    )}
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-sm font-medium text-foreground">
                      {item.quantity} × {formatINR(item.pricePaise)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Line total {formatINR(item.pricePaise * item.quantity)}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-xl border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
                No items recorded.
              </p>
            )}

            <Separator />

            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{formatINR(subtotalPaise)}</span>
              </div>

              {shippingPaise > 0 ? (
                <div className="flex justify-between text-muted-foreground">
                  <span>Shipping</span>
                  <span>{formatINR(shippingPaise)}</span>
                </div>
              ) : null}

              {taxAmountPaise > 0 ? (
                <div className="flex justify-between text-muted-foreground">
                  <span>GST</span>
                  <span>{formatINR(taxAmountPaise)}</span>
                </div>
              ) : null}

              <div className="flex justify-between pt-2 text-base font-semibold text-foreground">
                <span>Total</span>
                <span>{formatINR(order.totalPaise)}</span>
              </div>

              {order.paymentStatus === "refunded" &&
              order.refundedAmountPaise ? (
                <div className="flex justify-between pt-1 text-sm font-medium text-red-600">
                  <span>Refunded</span>
                  <span>{formatINR(order.refundedAmountPaise)}</span>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card shadow-sm">
          <CardHeader>
            <CardTitle>Order timeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {events.length > 0 ? (
              events.map((event) => {
                const payload = payloadSummary(event.payload as EventPayload);

                return (
                  <div
                    className="rounded-xl border border-border/70 bg-background/60 p-4"
                    key={event.id}
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {event.note}
                        </p>
                        {payload ? (
                          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                            {payload}
                          </p>
                        ) : null}
                      </div>
                      <Badge
                        className={badgeClassName(event.status)}
                        variant="outline"
                      >
                        {event.status}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {formatDateTime(event.createdAt)}
                    </p>
                  </div>
                );
              })
            ) : (
              <p className="rounded-xl border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
                No events yet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card shadow-sm">
          <CardHeader>
            <CardTitle>Manage order</CardTitle>
          </CardHeader>
          <CardContent>
            <OrderStatusEditor
              initialNote={order.internalNote ?? null}
              initialStatus={order.status}
              initialTrackingCarrier={order.trackingCarrier ?? null}
              initialTrackingNumber={order.trackingNumber ?? null}
              isRefunded={order.paymentStatus === "refunded"}
              orderId={order.id}
            />
          </CardContent>
        </Card>

        {hasShipmentDetails ? (
          <Card className="border-border/70 bg-card shadow-sm">
            <CardHeader>
              <CardTitle>Shipment details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <DetailBlock label="Tracking number" mono>
                {order.trackingNumber ?? "-"}
              </DetailBlock>

              <DetailBlock label="Carrier">
                {order.trackingCarrier ?? "-"}
              </DetailBlock>
            </CardContent>
          </Card>
        ) : null}

        {order.internalNote ? (
          <Card className="border-border/70 bg-card shadow-sm">
            <CardHeader>
              <CardTitle>Internal note</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {order.internalNote}
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
