"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useElectricShapeRows } from "@/lib/realtime/use-electric-shape";
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

type OrderRow = {
  id: string;
  paymentStatus: string;
  shippingName: null | string;
  status: string;
  totalPaise: number;
};

const statusFilters = ["all", "pending", "confirmed", "shipped", "delivered"] as const;

export default function AdminOrdersPage() {
  const [status, setStatus] = useState<(typeof statusFilters)[number]>("all");

  const loadOrders = useCallback(async (statusValue: string) => {
    const query = statusValue === "all" ? "" : `?status=${statusValue}`;
    const response = await fetch(`/api/v2/orders${query}`);
    if (!response.ok) return [] as OrderRow[];
    const data = (await response.json()) as OrderRow[];
    return data;
  }, []);

  const shapeParams = useMemo<Record<string, string | string[]>>(
    () =>
      status === "all"
        ? {
            params: [],
            replica: "full",
            where: "1=1",
          }
        : {
            params: [status],
            replica: "full",
            where: "status = $1",
          },
    [status]
  );

  const { mode, rows: orders } = useElectricShapeRows<OrderRow>({
    fallbackFetch: async () => await loadOrders(status),
    mapRows: (rows) =>
      rows
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const row = entry as Record<string, unknown>;
          return {
            id: String(row.id ?? ""),
            paymentStatus: String(row.paymentStatus ?? row.payment_status ?? "pending"),
            shippingName:
              (typeof row.shippingName === "string"
                ? row.shippingName
                : typeof row.shipping_name === "string"
                  ? row.shipping_name
                  : null),
            status: String(row.status ?? "pending"),
            totalPaise: Number(row.totalPaise ?? row.total_paise ?? 0),
          } satisfies OrderRow;
        })
        .filter((row): row is OrderRow => Boolean(row && row.id)),
    pollIntervalMs: 8_000,
    shapeParams,
    table: "orders",
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Orders</h2>
        <p className="text-sm text-muted-foreground">Track lifecycle and fulfillment status.</p>
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
          {mode === "electric" ? "Live via ElectricSQL shapes" : "Live via polling fallback"}
        </p>
      </div>

      <Tabs onValueChange={(value) => setStatus(value as typeof status)} value={status}>
        <TabsList>
          {statusFilters.map((filter) => (
            <TabsTrigger key={filter} value={filter}>
              {filter}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Order</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Payment</TableHead>
            <TableHead className="w-24">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.length > 0 ? (
            orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell className="font-medium">{order.id.slice(0, 8)}</TableCell>
                <TableCell>{order.shippingName}</TableCell>
                <TableCell>{formatINR(order.totalPaise)}</TableCell>
                <TableCell>
                  <Badge>{order.status}</Badge>
                </TableCell>
                <TableCell>{order.paymentStatus}</TableCell>
                <TableCell>
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/admin/orders/${order.id}`}>View</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell className="text-muted-foreground" colSpan={6}>
                No orders found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
