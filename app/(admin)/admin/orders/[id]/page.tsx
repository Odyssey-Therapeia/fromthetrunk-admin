"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatINR } from "@/db/money";

type OrderEvent = {
  createdAt: string;
  id: string;
  note: string;
  status: string;
};

type OrderItem = {
  id: string;
  name: string;
  pricePaise: number;
  quantity: number;
};

type Order = {
  id: string;
  items: OrderItem[];
  orderEvents: OrderEvent[];
  paymentStatus: string;
  shippingEmail: string | null;
  shippingName: string;
  status: "pending" | "confirmed" | "shipped" | "delivered";
  totalPaise: number;
};

const statusOptions: Array<Order["status"]> = ["pending", "confirmed", "shipped", "delivered"];

export default function AdminOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [order, setOrder] = useState<Order | null>(null);
  const [status, setStatus] = useState<Order["status"]>("pending");
  const [note, setNote] = useState("");

  const loadOrder = async () => {
    const response = await fetch(`/api/v2/orders/${id}`);
    if (!response.ok) return;
    const data = (await response.json()) as Order;
    setOrder(data);
    setStatus(data.status);
  };

  useEffect(() => {
    if (!id) return;
    void loadOrder();
  }, [id]);

  if (!order) {
    return <p className="text-sm text-muted-foreground">Loading order...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Order #{order.id.slice(0, 8)}</h2>
          <p className="text-sm text-muted-foreground">
            {order.shippingName} · {order.shippingEmail ?? "no email"}
          </p>
        </div>
        <Badge>{order.status}</Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {order.items.map((item) => (
              <div className="flex items-center justify-between rounded-md border p-3" key={item.id}>
                <p className="text-sm font-medium">{item.name}</p>
                <p className="text-sm text-muted-foreground">
                  {item.quantity} × {formatINR(item.pricePaise)}
                </p>
              </div>
            ))}
            <div className="pt-2 text-right text-sm font-semibold">
              Total: {formatINR(order.totalPaise)}
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
              <Select onValueChange={(value) => setStatus(value as Order["status"])} value={status}>
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

            <Button
              onClick={async () => {
                await fetch(`/api/v2/admin/orders/${order.id}/status`, {
                  body: JSON.stringify({
                    note,
                    status,
                  }),
                  headers: {
                    "Content-Type": "application/json",
                  },
                  method: "PATCH",
                });
                await loadOrder();
              }}
              type="button"
            >
              Save status
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {order.orderEvents.length > 0 ? (
            order.orderEvents.map((event) => (
              <div className="rounded-md border p-3" key={event.id}>
                <p className="text-sm font-medium">{event.note}</p>
                <p className="text-xs text-muted-foreground">
                  {event.status} · {new Date(event.createdAt).toLocaleString()}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No events yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
