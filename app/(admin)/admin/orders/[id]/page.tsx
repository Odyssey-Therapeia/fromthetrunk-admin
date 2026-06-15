import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";

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

  const paymentId = typeof payload.paymentId === "string" ? payload.paymentId : null;
  const paymentReference =
    typeof payload.paymentReference === "string" ? payload.paymentReference : null;
  const paymentLinkId =
    typeof payload.paymentLinkId === "string" ? payload.paymentLinkId : null;

  return [paymentId, paymentReference, paymentLinkId].filter(Boolean).join(" | ") || null;
};

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
  const subtotal = items.reduce(
    (sum, item) => sum + item.pricePaise * item.quantity,
    0
  );
  const shippingPaise = Math.max(order.totalPaise - subtotal - order.taxAmountPaise, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <Button asChild size="sm" variant="ghost">
            <Link href="/admin/orders">
              <ArrowLeft />
              Back to orders
            </Link>
          </Button>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              Order #{order.id.slice(0, 8).toUpperCase()}
            </h2>
            <p className="text-sm text-muted-foreground">
              Created {formatDateTime(order.createdAt)} | Updated {formatDateTime(order.updatedAt)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={badgeClassName(order.status)} variant="outline">
            {order.status}
          </Badge>
          <Badge className={badgeClassName(order.paymentStatus)} variant="outline">
            {order.paymentStatus}
          </Badge>
          {/* P6-05: Packing slip link */}
          <Button asChild size="sm" variant="outline">
            <Link href={`/admin/orders/${order.id}/packing-slip`} target="_blank">
              <Printer className="mr-1 h-3.5 w-3.5" />
              Packing slip
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {items.length > 0 ? (
                items.map((item) => (
                  <div
                    className="flex flex-col gap-2 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
                    key={item.id}
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{item.name}</p>
                      {item.productId && (
                        <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                          {item.productId}
                        </p>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {item.quantity} x {formatINR(item.pricePaise)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No items recorded.</p>
              )}
              <Separator />
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{formatINR(order.subtotalPaise || subtotal)}</span>
                </div>
                {shippingPaise > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Shipping</span>
                    <span>{formatINR(shippingPaise)}</span>
                  </div>
                )}
                {order.taxAmountPaise > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>GST</span>
                    <span>{formatINR(order.taxAmountPaise)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 text-base font-semibold text-foreground">
                  <span>Total</span>
                  <span>{formatINR(order.totalPaise)}</span>
                </div>
                {/* P6-05: Refund info */}
                {order.paymentStatus === "refunded" && order.refundedAmountPaise && (
                  <div className="flex justify-between pt-1 text-sm text-red-600">
                    <span>Refunded</span>
                    <span>{formatINR(order.refundedAmountPaise)}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {events.length > 0 ? (
                events.map((event) => {
                  const payload = payloadSummary(event.payload as EventPayload);
                  return (
                    <div className="rounded-lg border border-border p-4" key={event.id}>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-medium">{event.note}</p>
                          {payload && (
                            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                              {payload}
                            </p>
                          )}
                        </div>
                        <Badge className={badgeClassName(event.status)} variant="outline">
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
                <p className="text-sm text-muted-foreground">No events yet.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Update status</CardTitle>
            </CardHeader>
            <CardContent>
              {/* P6-05: Pass tracking, note, and refund state to the editor */}
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

          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Name</p>
                <p className="mt-1 font-medium text-foreground">{order.shippingName ?? "-"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Contact</p>
                <p className="mt-1 text-foreground">{order.shippingEmail ?? "-"}</p>
                <p className="text-muted-foreground">{order.shippingPhone ?? "-"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Ship to</p>
                <p className="mt-1 text-foreground">{order.shippingLine1 ?? "-"}</p>
                {order.shippingLine2 && <p className="text-foreground">{order.shippingLine2}</p>}
                <p className="text-muted-foreground">
                  {[order.shippingCity, order.shippingState, order.shippingPostalCode]
                    .filter(Boolean)
                    .join(", ")}
                </p>
                <p className="text-muted-foreground">{order.shippingCountry ?? ""}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Gateway</p>
                <p className="mt-1 text-foreground">{order.paymentGateway ?? "-"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Method</p>
                <p className="mt-1 text-foreground">{order.paymentMethod ?? "-"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Payment ID</p>
                <p className="mt-1 break-all font-mono text-xs text-foreground">
                  {order.paymentId ?? "-"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Razorpay Ref</p>
                <p className="mt-1 break-all font-mono text-xs text-foreground">
                  {order.razorpayOrderId ?? "-"}
                </p>
              </div>
              {/* P6-05: Refund details */}
              {order.refundId && (
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Refund ID</p>
                  <p className="mt-1 break-all font-mono text-xs text-red-600">
                    {order.refundId}
                  </p>
                </div>
              )}
              {order.refundedAt && (
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Refunded at</p>
                  <p className="mt-1 text-foreground">{formatDateTime(order.refundedAt)}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* P6-05: Tracking info card */}
          {(order.trackingNumber || order.trackingCarrier) && (
            <Card>
              <CardHeader>
                <CardTitle>Shipment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {order.trackingNumber && (
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Tracking</p>
                    <p className="mt-1 font-mono text-foreground">{order.trackingNumber}</p>
                  </div>
                )}
                {order.trackingCarrier && (
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Carrier</p>
                    <p className="mt-1 text-foreground">{order.trackingCarrier}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* P6-05: Internal note display */}
          {order.internalNote && (
            <Card>
              <CardHeader>
                <CardTitle>Internal note</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{order.internalNote}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
