"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, RefreshCw, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatINR } from "@/db/money";

type OrderItem = {
  id: string;
  name: string;
  pricePaise: number;
  productId: null | string;
  quantity: number;
};

type OrderRow = {
  createdAt: string;
  id: string;
  items: OrderItem[];
  paymentId: null | string;
  paymentStatus: string;
  razorpayOrderId: null | string;
  shippingEmail: null | string;
  shippingName: null | string;
  shippingPhone: null | string;
  status: string;
  totalPaise: number;
};

const statusFilters = [
  "all",
  "pending",
  "confirmed",
  "shipped",
  "delivered",
] as const;
const paymentFilters = [
  "all",
  "pending",
  "paid",
  "failed",
  "refunded",
] as const;

const statusClassName = (status: string) => {
  switch (status) {
    case "confirmed":
    case "delivered":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "shipped":
      return "border-blue-200 bg-blue-50 text-blue-800";
    case "pending":
      return "border-amber-200 bg-amber-50 text-amber-800";
    default:
      return "border-border bg-background text-foreground";
  }
};

const paymentClassName = (status: string) => {
  switch (status) {
    case "paid":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "failed":
    case "refunded":
      return "border-red-200 bg-red-50 text-red-800";
    case "pending":
      return "border-amber-200 bg-amber-50 text-amber-800";
    default:
      return "border-border bg-background text-foreground";
  }
};

const formatDateTime = (value: string) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kolkata",
      }).format(new Date(value))
    : "Unknown";

const itemSummary = (items: OrderItem[]) =>
  items.length > 0
    ? items.map((item) => `${item.name} x${item.quantity}`).join(", ")
    : "No items recorded";

const normalizeOrder = (entry: unknown): OrderRow | null => {
  if (!entry || typeof entry !== "object") return null;

  const row = entry as Record<string, unknown>;
  const items = Array.isArray(row.items)
    ? row.items
        .map((item) => {
          if (!item || typeof item !== "object") return null;

          const itemRow = item as Record<string, unknown>;
          return {
            id: String(itemRow.id ?? ""),
            name: String(itemRow.name ?? "Untitled item"),
            pricePaise: Number(itemRow.pricePaise ?? itemRow.price_paise ?? 0),
            productId:
              typeof itemRow.productId === "string"
                ? itemRow.productId
                : typeof itemRow.product_id === "string"
                  ? itemRow.product_id
                  : null,
            quantity: Number(itemRow.quantity ?? 1),
          } satisfies OrderItem;
        })
        .filter((item): item is OrderItem => Boolean(item?.id))
    : [];

  return {
    createdAt: String(row.createdAt ?? row.created_at ?? ""),
    id: String(row.id ?? ""),
    items,
    paymentId:
      typeof row.paymentId === "string"
        ? row.paymentId
        : typeof row.payment_id === "string"
          ? row.payment_id
          : null,
    paymentStatus: String(row.paymentStatus ?? row.payment_status ?? "pending"),
    razorpayOrderId:
      typeof row.razorpayOrderId === "string"
        ? row.razorpayOrderId
        : typeof row.razorpay_order_id === "string"
          ? row.razorpay_order_id
          : null,
    shippingEmail:
      typeof row.shippingEmail === "string"
        ? row.shippingEmail
        : typeof row.shipping_email === "string"
          ? row.shipping_email
          : null,
    shippingName:
      typeof row.shippingName === "string"
        ? row.shippingName
        : typeof row.shipping_name === "string"
          ? row.shipping_name
          : null,
    shippingPhone:
      typeof row.shippingPhone === "string"
        ? row.shippingPhone
        : typeof row.shipping_phone === "string"
          ? row.shipping_phone
          : null,
    status: String(row.status ?? "pending"),
    totalPaise: Number(row.totalPaise ?? row.total_paise ?? 0),
  };
};

export default function AdminOrdersPage() {
  const [status, setStatus] = useState<(typeof statusFilters)[number]>("all");
  const [paymentStatus, setPaymentStatus] =
    useState<(typeof paymentFilters)[number]>("all");
  const [query, setQuery] = useState("");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [error, setError] = useState<null | string>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastLoadedAt, setLastLoadedAt] = useState<null | Date>(null);

  const loadOrders = useCallback(async () => {
    const statusQuery = status === "all" ? "" : `?status=${status}`;
    const response = await fetch(`/api/v2/orders${statusQuery}`);

    if (!response.ok) {
      throw new Error("Unable to load orders.");
    }

    const data = (await response.json()) as unknown[];
    setOrders(
      data
        .map(normalizeOrder)
        .filter((order): order is OrderRow => Boolean(order?.id)),
    );
    setLastLoadedAt(new Date());
    setError(null);
  }, [status]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setIsLoading(true);
      try {
        await loadOrders();
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load orders.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void run();

    const interval = window.setInterval(() => {
      void loadOrders().catch((loadError) => {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to refresh orders.",
        );
      });
    }, 10_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [loadOrders]);

  const filteredOrders = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return orders.filter((order) => {
      if (paymentStatus !== "all" && order.paymentStatus !== paymentStatus)
        return false;
      if (!normalizedQuery) return true;

      const haystack = [
        order.id,
        order.paymentId,
        order.razorpayOrderId,
        order.shippingEmail,
        order.shippingName,
        order.shippingPhone,
        itemSummary(order.items),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [orders, paymentStatus, query]);

  const metrics = useMemo(
    () => ({
      failed: orders.filter((order) => order.paymentStatus === "failed").length,
      paid: orders.filter((order) => order.paymentStatus === "paid").length,
      pending: orders.filter((order) => order.paymentStatus === "pending")
        .length,
      total: orders.length,
    }),
    [orders],
  );

  const handleRefresh = useCallback(async () => {
    setIsLoading(true);
    try {
      await loadOrders();
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to refresh orders.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [loadOrders]);

  const lastLoadedLabel = lastLoadedAt
    ? new Intl.DateTimeFormat("en-IN", {
        timeStyle: "medium",
        timeZone: "Asia/Kolkata",
      }).format(lastLoadedAt)
    : "Not loaded yet";

  const renderMobileOrder = (order: OrderRow) => (
    <div
      className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-sm"
      key={order.id}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs font-medium text-muted-foreground">
            #{order.id.slice(0, 8).toUpperCase()}
          </p>
          <h3 className="mt-1 truncate text-sm font-semibold text-foreground">
            {order.shippingName ?? "No customer name"}
          </h3>
        </div>
        <Badge
          className={paymentClassName(order.paymentStatus)}
          variant="outline"
        >
          {order.paymentStatus}
        </Badge>
      </div>
      <p className="text-sm text-foreground">{itemSummary(order.items)}</p>
      <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
        <div>
          <span className="block uppercase tracking-[0.15em]">Total</span>
          <span className="text-sm font-semibold text-foreground">
            {formatINR(order.totalPaise)}
          </span>
        </div>
        <div>
          <span className="block uppercase tracking-[0.15em]">Created</span>
          <span className="text-sm text-foreground">
            {formatDateTime(order.createdAt)}
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <Badge className={statusClassName(order.status)} variant="outline">
          {order.status}
        </Badge>
        <Button asChild size="sm" variant="outline">
          <Link href={`/admin/orders/${order.id}`}>View</Link>
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Orders</h2>
          <p className="text-sm text-muted-foreground">
            Track paid orders, failed attempts, buyer details, and purchased
            sarees.
          </p>
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
            Last refreshed {lastLoadedLabel}
          </p>
        </div>
        <Button
          className="w-full sm:w-auto"
          disabled={isLoading}
          onClick={handleRefresh}
          type="button"
          variant="outline"
        >
          <RefreshCw className={isLoading ? "animate-spin" : ""} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Total", metrics.total],
          ["Paid", metrics.paid],
          ["Pending", metrics.pending],
          ["Failed", metrics.failed],
        ].map(([label, value]) => (
          <div
            className="rounded-lg border border-border bg-card p-4 shadow-sm"
            key={label}
          >
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {label}
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {value}
            </p>
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <div className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search customer, item, phone, payment ID"
              value={query}
            />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Tabs
              onValueChange={(value) => setStatus(value as typeof status)}
              value={status}
            >
              <TabsList className="w-full overflow-x-auto sm:w-auto">
                {statusFilters.map((filter) => (
                  <TabsTrigger key={filter} value={filter}>
                    {filter}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Tabs
              onValueChange={(value) =>
                setPaymentStatus(value as typeof paymentStatus)
              }
              value={paymentStatus}
            >
              <TabsList className="w-full overflow-x-auto sm:w-auto">
                {paymentFilters.map((filter) => (
                  <TabsTrigger key={filter} value={filter}>
                    {filter}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </div>

        <div className="space-y-3 md:hidden">
          {filteredOrders.length > 0 ? (
            filteredOrders.map(renderMobileOrder)
          ) : (
            <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
              {isLoading ? "Loading orders..." : "No orders found."}
            </div>
          )}
        </div>

        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders.length > 0 ? (
                filteredOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-mono text-xs font-medium">
                          {order.id.slice(0, 8).toUpperCase()}
                        </p>
                        {order.paymentId && (
                          <p className="font-mono text-[11px] text-muted-foreground">
                            {order.paymentId}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-45 space-y-1">
                        <p className="truncate font-medium">
                          {order.shippingName ?? "No name"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {order.shippingEmail ??
                            order.shippingPhone ??
                            "No contact"}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-70">
                      <p className="truncate text-sm">
                        {itemSummary(order.items)}
                      </p>
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatINR(order.totalPaise)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={statusClassName(order.status)}
                        variant="outline"
                      >
                        {order.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={paymentClassName(order.paymentStatus)}
                        variant="outline"
                      >
                        {order.paymentStatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(order.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Button asChild size="sm" variant="ghost">
                        <Link href={`/admin/orders/${order.id}`}>View</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={8}>
                    {isLoading ? "Loading orders..." : "No orders found."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
