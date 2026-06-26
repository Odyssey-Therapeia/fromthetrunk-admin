"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

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

type EditorSectionProps = {
  children: ReactNode;
  description: string;
  eyebrow: string;
  title: string;
  tone?: "default" | "danger";
};

const statusDescriptions: Record<string, string> = {
  pending: "The order still needs confirmation or follow-up.",
  confirmed: "The order is accepted and ready to be prepared.",
  shipped: "The order has been dispatched to the customer.",
  delivered: "The order has reached the customer.",
};

const readMutationError = async (response: Response, fallback: string) => {
  const data = (await response.json().catch(() => null)) as {
    message?: string;
  } | null;

  return data?.message || fallback;
};

function EditorSection({
  children,
  description,
  eyebrow,
  title,
  tone = "default",
}: EditorSectionProps) {
  return (
    <section
      className={`rounded-xl border p-4 ${
        tone === "danger"
          ? "border-red-200 bg-red-50/50"
          : "border-border/70 bg-background/60"
      }`}
    >
      <div className="mb-4">
        <p
          className={`text-xs font-semibold uppercase tracking-[0.2em] ${
            tone === "danger" ? "text-red-700" : "text-muted-foreground"
          }`}
        >
          {eyebrow}
        </p>
        <h3 className="mt-1 text-sm font-semibold text-foreground">{title}</h3>
        <p
          className={`mt-1 text-xs ${
            tone === "danger" ? "text-red-700/80" : "text-muted-foreground"
          }`}
        >
          {description}
        </p>
      </div>

      {children}
    </section>
  );
}

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
  const [savedStatus, setSavedStatus] = useState(initialStatus);
  const [statusNote, setStatusNote] = useState("");
  const [statusError, setStatusError] = useState<null | string>(null);
  const [statusSaved, setStatusSaved] = useState(false);
  const [isSavingStatus, setIsSavingStatus] = useState(false);

  // Internal note
  const [note, setNote] = useState(initialNote ?? "");
  const [noteError, setNoteError] = useState<null | string>(null);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  // Tracking
  const [trackingNumber, setTrackingNumber] = useState(
    initialTrackingNumber ?? "",
  );
  const [trackingCarrier, setTrackingCarrier] = useState(
    initialTrackingCarrier ?? "",
  );
  const [trackingError, setTrackingError] = useState<null | string>(null);
  const [isSavingTracking, setIsSavingTracking] = useState(false);
  const [trackingEmailSent, setTrackingEmailSent] = useState<boolean | null>(
    null,
  );

  // Refund
  const [refundError, setRefundError] = useState<null | string>(null);
  const [isRefunding, setIsRefunding] = useState(false);
  const [refundDone, setRefundDone] = useState(false);

  const currentStatusDescription =
    statusDescriptions[selectedStatus] ?? "Update the fulfilment state.";

  const handleSaveStatus = async () => {
    if (statusNote.length > NOTE_MAX) {
      setStatusError(`Note must be ${NOTE_MAX} characters or fewer.`);
      return;
    }

    setIsSavingStatus(true);
    setStatusError(null);
    setStatusSaved(false);

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
        throw new Error(
          await readMutationError(response, "Unable to update order status."),
        );
      }

      setSavedStatus(selectedStatus);
      setStatusNote("");
      setStatusSaved(true);
      router.refresh();
    } catch (saveError) {
      setStatusError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update status.",
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
        throw new Error(
          await readMutationError(response, "Unable to save note."),
        );
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
        throw new Error(
          await readMutationError(response, "Unable to save tracking info."),
        );
      }

      const data = (await response.json().catch(() => null)) as {
        emailSent?: boolean;
      } | null;

      setTrackingEmailSent(data?.emailSent ?? false);
      router.refresh();
    } catch (err) {
      setTrackingError(
        err instanceof Error ? err.message : "Unable to save tracking.",
      );
    } finally {
      setIsSavingTracking(false);
    }
  };

  const handleRefund = async () => {
    if (
      !window.confirm(
        "Issue a full refund for this order? This cannot be undone.",
      )
    ) {
      return;
    }

    setIsRefunding(true);
    setRefundError(null);

    try {
      const response = await fetch(`/api/v2/admin/orders/${orderId}/refund`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(
          await readMutationError(response, "Unable to issue refund."),
        );
      }

      setRefundDone(true);
      router.refresh();
    } catch (err) {
      setRefundError(
        err instanceof Error ? err.message : "Unable to issue refund.",
      );
    } finally {
      setIsRefunding(false);
    }
  };

  return (
    <div className="space-y-4">
      <EditorSection
        description="Move the order through the fulfilment journey. Add a note only when the change needs context."
        eyebrow="Fulfilment"
        title="Update order stage"
      >
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              onValueChange={(value) => {
                setSelectedStatus(value);
                setStatusSaved(false);
                setStatusError(null);
              }}
              value={selectedStatus}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose status" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((statusOption) => (
                  <SelectItem key={statusOption} value={statusOption}>
                    {statusOption}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {currentStatusDescription}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Status note</Label>
            <Input
              maxLength={NOTE_MAX}
              onChange={(event) => {
                setStatusNote(event.target.value);
                setStatusSaved(false);
              }}
              placeholder="Optional context for this status change"
              value={statusNote}
            />
            {statusNote.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                {statusNote.length}/{NOTE_MAX}
              </p>
            ) : null}
          </div>

          {statusError ? (
            <p className="text-sm text-destructive">{statusError}</p>
          ) : null}

          {statusSaved ? (
            <p className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              Status updated.
            </p>
          ) : null}

          <Button
            className="w-full sm:w-auto"
            disabled={isSavingStatus || selectedStatus === savedStatus}
            onClick={handleSaveStatus}
            type="button"
          >
            {isSavingStatus ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {isSavingStatus ? "Saving..." : "Save status"}
          </Button>
        </div>
      </EditorSection>

      <EditorSection
        description="Private note for your team. This is not visible to the customer."
        eyebrow="Ops note"
        title="Internal note"
      >
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Note</Label>
            <Textarea
              maxLength={NOTE_MAX}
              onChange={(event) => {
                setNote(event.target.value);
                setNoteSaved(false);
              }}
              placeholder="Add internal notes, fulfilment context, or support observations."
              rows={4}
              value={note}
            />
            <p className="text-xs text-muted-foreground">
              {note.length}/{NOTE_MAX}
            </p>
          </div>

          {noteError ? (
            <p className="text-sm text-destructive">{noteError}</p>
          ) : null}

          {noteSaved ? (
            <p className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              Internal note saved.
            </p>
          ) : null}

          <Button
            className="w-full sm:w-auto"
            disabled={isSavingNote}
            onClick={handleSaveNote}
            size="sm"
            type="button"
            variant="outline"
          >
            {isSavingNote ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {isSavingNote ? "Saving..." : "Save note"}
          </Button>
        </div>
      </EditorSection>

      <EditorSection
        description="Add courier details after dispatch. If the tracking details change, the system may email the customer."
        eyebrow="Shipment"
        title="Tracking details"
      >
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Tracking number</Label>
            <Input
              onChange={(event) => {
                setTrackingNumber(event.target.value);
                setTrackingEmailSent(null);
              }}
              placeholder="e.g. 1Z999AA10123456784"
              value={trackingNumber}
            />
          </div>

          <div className="space-y-2">
            <Label>Carrier</Label>
            <Input
              onChange={(event) => {
                setTrackingCarrier(event.target.value);
                setTrackingEmailSent(null);
              }}
              placeholder="e.g. BlueDart, DTDC, India Post"
              value={trackingCarrier}
            />
          </div>

          {trackingError ? (
            <p className="text-sm text-destructive">{trackingError}</p>
          ) : null}

          {trackingEmailSent === true ? (
            <p className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              Tracking saved and shipping email sent.
            </p>
          ) : null}

          {trackingEmailSent === false ? (
            <p className="text-sm text-muted-foreground">
              Tracking saved. No email was sent because the tracking details did
              not change.
            </p>
          ) : null}

          <Button
            className="w-full sm:w-auto"
            disabled={isSavingTracking}
            onClick={handleSaveTracking}
            size="sm"
            type="button"
            variant="outline"
          >
            {isSavingTracking ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {isSavingTracking ? "Saving..." : "Save tracking"}
          </Button>
        </div>
      </EditorSection>

      <EditorSection
        description="Refunds are financial actions. Use only after confirming with the team."
        eyebrow="Danger zone"
        title="Refund order"
        tone="danger"
      >
        <div className="space-y-3">
          {refundError ? (
            <p className="text-sm text-destructive">{refundError}</p>
          ) : null}

          {refundDone || isRefunded ? (
            <p className="flex items-center gap-2 text-sm font-medium text-red-700">
              <CheckCircle2 className="h-4 w-4" />
              This order has been refunded.
            </p>
          ) : (
            <>
              <div className="flex gap-2 rounded-lg border border-red-200 bg-red-100/60 p-3 text-sm text-red-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  This issues a full refund through the connected payment flow.
                  The action cannot be undone from this screen.
                </p>
              </div>

              <Button
                disabled={isRefunding}
                onClick={handleRefund}
                size="sm"
                type="button"
                variant="destructive"
              >
                {isRefunding ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {isRefunding ? "Processing refund..." : "Issue refund"}
              </Button>
            </>
          )}
        </div>
      </EditorSection>
    </div>
  );
}
