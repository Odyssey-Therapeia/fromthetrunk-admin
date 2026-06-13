"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { formatINR } from "@/db/money";

type OrderEvent = {
  createdAt: string;
  id: string;
  note: string;
  payload: null | Record<string, unknown>;
  status: string;
};

type OrderItem = {
  id: string;
  name: string;
  pricePaise: number;
  productId: null | string;
  quantity: number;
};

type Order = {
  createdAt: string;
  events: OrderEvent[];
  id: string;
  items: OrderItem[];
  paymentGateway: null | string;
  paymentId: null | string;
  paymentMethod: null | string;
  paymentStatus: string;
  razorpayOrderId: null | string;
  shippingCity: null | string;
  shippingCountry: null | string;
  shippingEmail: null | string;
  shippingLine1: null | string;
  shippingLine2: null | string;
  shippingName: null | string;
  shippingPhone: null | string;
  shippingPostalCode: null | string;
  shippingState: null | string;
  status: "pending" | "confirmed" | "shipped" | "delivered";
  subtotalPaise: number;
  taxAmountPaise: number;
  totalPaise: number;
  updatedAt: string;
};

const statusOptions: Array<Order["status"]> = ["pending", "confirmed", "shipped", "delivered"];

const formatDateTime = (value: string) =>
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

const payloadSummary = (payload: OrderEvent["payload"]) => {
  if (!payload) return null;

  const paymentId = typeof payload.paymentId === "string" ? payload.paymentId : null;
  const paymentReference =
    typeof payload.paymentReference === "string" ? payload.paymentReference : null;
  const paymentLinkId =
    typeof payload.paymentLinkId === "string" ? payload.paymentLinkId : null;

  return [paymentId, paymentReference, paymentLinkId].filter(Boolean).join(" · ") || null;
};

export default function AdminOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [statusDraft, setStatusDraft] = useState<null | Order["status"]>(null);
  const [note, setNote] = useState("");
  const [statusError, setStatusError] = useState<null | string>(null);
  const [isSavingStatus, setIsSavingStatus] = useState(false);

  const loadOrder = async (): Promise<Order> => {
    const response = await fetch(`/api/v2/orders/${id}`);
    if (!response.ok) {
      throw new Error("Unable to load order.");
    }
    return (await response.json()) as Order;
  };

  const {
    data: order,
    error,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    enabled: Boolean(id),
    queryFn: loadOrder,
    queryKey: ["admin-order", id],
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading order...</p>;
  }

  if (error || !order) {
    return (
      <div className="space-y-4">
        <Button asChild size="sm" variant="ghost">
          <Link href="/admin/orders">
            <ArrowLeft />
            Back to orders
          </Link>
        </Button>
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error instanceof Error ? error.message : "Order not found."}
        </div>
      </div>
    );
  }

  const selectedStatus = statusDraft ?? order.status;
  const subtotal = order.items.reduce(
    (sum, item) => sum + item.pricePaise * item.quantity,
    0
  );
  const shippingPaise = Math.max(order.totalPaise - subtotal - order.taxAmountPaise, 0);

  const handleSaveStatus = async () => {
    setIsSavingStatus(true);
    setStatusError(null);

    try {
      const response = await fetch(`/api/v2/admin/orders/${order.id}/status`, {
        body: JSON.stringify({
          note: note.trim() || undefined,
          status: selectedStatus,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "PATCH",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message || "Unable to update order status.");
      }

      setStatusDraft(null);
      setNote("");
      await refetch();
    } catch (saveError) {
      setStatusError(saveError instanceof Error ? saveError.message : "Unable to update status.");
    } finally {
      setIsSavingStatus(false);
    }
  };

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
              Created {formatDateTime(order.createdAt)} · Updated {formatDateTime(order.updatedAt)}
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
          <Button
            disabled={isRefetching}
            onClick={() => void refetch()}
            size="sm"
            type="button"
            variant="outline"
          >
            <RefreshCw className={isRefetching ? "animate-spin" : ""} />
            Refresh
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
              {order.items.map((item) => (
                <div
                  className="flex flex-col gap-2 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
                  key={item.id}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{item.name}</p>
                    {item.productId && (
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        {item.productId}
                      </p>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {item.quantity} x {formatINR(item.pricePaise)}
                  </p>
                </div>
              ))}
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
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {order.events.length > 0 ? (
                order.events.map((event) => {
                  const payload = payloadSummary(event.payload);
                  return (
                    <div className="rounded-lg border border-border p-4" key={event.id}>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-medium">{event.note}</p>
                          {payload && (
                            <p className="mt-1 font-mono text-xs text-muted-foreground">
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Update status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  onValueChange={(value) => setStatusDraft(value as Order["status"])}
                  value={selectedStatus}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((statusOption) => (
                      <SelectItem key={statusOption} value={statusOption}>
                        {statusOption}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Note</Label>
                <Input onChange={(event) => setNote(event.target.value)} value={note} />
              </div>

              {statusError && <p className="text-sm text-destructive">{statusError}</p>}

              <Button
                disabled={isSavingStatus || selectedStatus === order.status}
                onClick={handleSaveStatus}
                type="button"
              >
                {isSavingStatus ? "Saving..." : "Save status"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
