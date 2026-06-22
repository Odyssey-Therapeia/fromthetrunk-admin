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
import { Textarea } from "@/components/ui/textarea";

const statusOptions = ["pending", "confirmed", "shipped", "delivered"] as const;

const NOTE_MAX = 500;

type OrderStatusEditorProps = {
  initialStatus: string;
  initialNote?: string | null;
  initialTrackingNumber?: string | null;
  initialTrackingCarrier?: string | null;
  orderId: string;
  isRefunded?: boolean;
};

export function OrderStatusEditor({
  initialStatus,
  initialNote,
  initialTrackingNumber,
  initialTrackingCarrier,
  orderId,
  isRefunded = false,
}: OrderStatusEditorProps) {
  const router = useRouter();

  // Status
  const [selectedStatus, setSelectedStatus] = useState(initialStatus);
  const [statusNote, setStatusNote] = useState("");
  const [statusError, setStatusError] = useState<null | string>(null);
  const [isSavingStatus, setIsSavingStatus] = useState(false);

  // Internal note
  const [note, setNote] = useState(initialNote ?? "");
  const [noteError, setNoteError] = useState<null | string>(null);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  // Tracking
  const [trackingNumber, setTrackingNumber] = useState(initialTrackingNumber ?? "");
  const [trackingCarrier, setTrackingCarrier] = useState(initialTrackingCarrier ?? "");
  const [trackingError, setTrackingError] = useState<null | string>(null);
  const [isSavingTracking, setIsSavingTracking] = useState(false);
  const [trackingEmailSent, setTrackingEmailSent] = useState<boolean | null>(null);

  // Refund
  const [refundError, setRefundError] = useState<null | string>(null);
  const [isRefunding, setIsRefunding] = useState(false);
  const [refundDone, setRefundDone] = useState(false);

  const handleSaveStatus = async () => {
    if (statusNote.length > NOTE_MAX) {
      setStatusError(`Note must be ${NOTE_MAX} characters or fewer.`);
      return;
    }
    setIsSavingStatus(true);
    setStatusError(null);

    try {
      const response = await fetch(`/api/v2/admin/orders/${orderId}/status`, {
        body: JSON.stringify({
          note: statusNote.trim() || undefined,
          status: selectedStatus,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message || "Unable to update order status.");
      }

      setStatusNote("");
      router.refresh();
    } catch (saveError) {
      setStatusError(
        saveError instanceof Error ? saveError.message : "Unable to update status."
      );
    } finally {
      setIsSavingStatus(false);
    }
  };

  const handleSaveNote = async () => {
    if (note.length > NOTE_MAX) {
      setNoteError(`Note must be ${NOTE_MAX} characters or fewer.`);
      return;
    }
    setIsSavingNote(true);
    setNoteError(null);
    setNoteSaved(false);

    try {
      const response = await fetch(`/api/v2/admin/orders/${orderId}/note`, {
        body: JSON.stringify({ note }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message || "Unable to save note.");
      }

      setNoteSaved(true);
      router.refresh();
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : "Unable to save note.");
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleSaveTracking = async () => {
    setIsSavingTracking(true);
    setTrackingError(null);
    setTrackingEmailSent(null);

    try {
      const response = await fetch(`/api/v2/admin/orders/${orderId}/tracking`, {
        body: JSON.stringify({
          trackingNumber: trackingNumber.trim() || null,
          trackingCarrier: trackingCarrier.trim() || null,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message || "Unable to save tracking info.");
      }

      const data = await response.json();
      setTrackingEmailSent(data.emailSent ?? false);
      router.refresh();
    } catch (err) {
      setTrackingError(err instanceof Error ? err.message : "Unable to save tracking.");
    } finally {
      setIsSavingTracking(false);
    }
  };

  const handleRefund = async () => {
    if (!window.confirm("Issue a full refund for this order? This cannot be undone.")) return;

    setIsRefunding(true);
    setRefundError(null);

    try {
      const response = await fetch(`/api/v2/admin/orders/${orderId}/refund`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message || "Unable to issue refund.");
      }

      setRefundDone(true);
      router.refresh();
    } catch (err) {
      setRefundError(err instanceof Error ? err.message : "Unable to issue refund.");
    } finally {
      setIsRefunding(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Status ─────────────────────────────────────────────────────── */}
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
          <Label>Status note</Label>
          <Input
            maxLength={NOTE_MAX}
            onChange={(e) => setStatusNote(e.target.value)}
            placeholder="Optional note for this status change"
            value={statusNote}
          />
          {statusNote.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {statusNote.length}/{NOTE_MAX}
            </p>
          )}
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

      {/* ── Internal note ──────────────────────────────────────────────── */}
      <div className="space-y-3 border-t border-border pt-4">
        <div className="space-y-2">
          <Label>Internal note</Label>
          <Textarea
            maxLength={NOTE_MAX}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Internal notes (not visible to customer)"
            rows={3}
            value={note}
          />
          <p className="text-xs text-muted-foreground">
            {note.length}/{NOTE_MAX}
          </p>
        </div>

        {noteError && <p className="text-sm text-destructive">{noteError}</p>}
        {noteSaved && <p className="text-sm text-emerald-600">Note saved.</p>}

        <Button
          disabled={isSavingNote}
          onClick={handleSaveNote}
          size="sm"
          type="button"
          variant="outline"
        >
          {isSavingNote ? "Saving..." : "Save note"}
        </Button>
      </div>

      {/* ── Tracking ───────────────────────────────────────────────────── */}
      <div className="space-y-3 border-t border-border pt-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Shipment tracking
        </p>
        <div className="space-y-2">
          <Label>Tracking number</Label>
          <Input
            onChange={(e) => setTrackingNumber(e.target.value)}
            placeholder="e.g. 1Z999AA10123456784"
            value={trackingNumber}
          />
        </div>
        <div className="space-y-2">
          <Label>Carrier</Label>
          <Input
            onChange={(e) => setTrackingCarrier(e.target.value)}
            placeholder="e.g. BlueDart, DTDC, India Post"
            value={trackingCarrier}
          />
        </div>

        {trackingError && <p className="text-sm text-destructive">{trackingError}</p>}
        {trackingEmailSent === true && (
          <p className="text-sm text-emerald-600">Shipping email sent to customer.</p>
        )}
        {trackingEmailSent === false && (
          <p className="text-sm text-muted-foreground">Tracking saved (no email — tracking unchanged).</p>
        )}

        <Button
          disabled={isSavingTracking}
          onClick={handleSaveTracking}
          size="sm"
          type="button"
          variant="outline"
        >
          {isSavingTracking ? "Saving..." : "Save tracking"}
        </Button>
      </div>

      {/* ── Refund ─────────────────────────────────────────────────────── */}
      <div className="space-y-3 border-t border-border pt-4">
        {refundError && <p className="text-sm text-destructive">{refundError}</p>}
        {(refundDone || isRefunded) ? (
          <p className="text-sm font-medium text-red-600">Order has been refunded.</p>
        ) : (
          <Button
            disabled={isRefunding}
            onClick={handleRefund}
            size="sm"
            type="button"
            variant="destructive"
          >
            {isRefunding ? "Processing refund..." : "Issue refund"}
          </Button>
        )}
      </div>
    </div>
  );
}
