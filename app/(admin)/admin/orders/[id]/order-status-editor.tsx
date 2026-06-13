"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const statusOptions = ["pending", "confirmed", "shipped", "delivered"] as const;

type OrderStatusEditorProps = {
  initialStatus: string;
  orderId: string;
};

export function OrderStatusEditor({ initialStatus, orderId }: OrderStatusEditorProps) {
  const router = useRouter();
  const [selectedStatus, setSelectedStatus] = useState(initialStatus);
  const [note, setNote] = useState("");
  const [statusError, setStatusError] = useState<null | string>(null);
  const [isSavingStatus, setIsSavingStatus] = useState(false);

  const handleSaveStatus = async () => {
    setIsSavingStatus(true);
    setStatusError(null);

    try {
      const response = await fetch(`/api/v2/admin/orders/${orderId}/status`, {
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

      setNote("");
      router.refresh();
    } catch (saveError) {
      setStatusError(
        saveError instanceof Error ? saveError.message : "Unable to update status."
      );
    } finally {
      setIsSavingStatus(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Status</Label>
        <Select onValueChange={(value) => setSelectedStatus(value)} value={selectedStatus}>
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
        disabled={isSavingStatus || selectedStatus === initialStatus}
        onClick={handleSaveStatus}
        type="button"
      >
        {isSavingStatus ? "Saving..." : "Save status"}
      </Button>
    </div>
  );
}
