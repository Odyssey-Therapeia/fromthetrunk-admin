"use client";

/**
 * P6-02: Admin discount codes manager.
 *
 * CRUD for the discounts table.
 * Persists via /api/v2/admin/discounts (requireAdmin gated).
 *
 * Form uses SchemaForm driven by discountFormSchema (P2-02a contract).
 * Design: shadcn/Radix primitives + Tailwind v4 tokens only.
 * No hex colors, no arbitrary px values.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Tag, Trash2, ToggleLeft, ToggleRight, Pencil } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SchemaForm } from "@/components/admin/schema-form/schema-form";
import {
  discountFormSchema,
  discountFormFullWidthKeys,
} from "@/components/admin/schema-form/discount.schema";
import { formatCurrency } from "@/lib/formatters";

// ── Types ─────────────────────────────────────────────────────────────────────

type DiscountType = "percent" | "fixed";

type Discount = {
  id: string;
  code: string;
  type: DiscountType;
  value: number;
  minSubtotalPaise: number;
  collectionId: string | null;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  usageCount: number;
  active: boolean;
  createdAt: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const readErrorMessage = async (response: Response): Promise<string> => {
  try {
    const data = (await response.json()) as { message?: string };
    if (typeof data.message === "string" && data.message.length > 0) {
      return data.message;
    }
  } catch {
    // fall through
  }
  return `Request failed with ${response.status}`;
};

const formatValue = (type: DiscountType, value: number): string => {
  if (type === "percent") return `${value}%`;
  return formatCurrency(value / 100);
};

const formatWindow = (startsAt: string | null, endsAt: string | null): string => {
  if (!startsAt && !endsAt) return "Always active";
  const start = startsAt ? new Date(startsAt).toLocaleDateString("en-IN") : "—";
  const end = endsAt ? new Date(endsAt).toLocaleDateString("en-IN") : "—";
  return `${start} → ${end}`;
};

// ── Empty form values ─────────────────────────────────────────────────────────

const emptyFormValues = (): Record<string, unknown> => ({
  code: "",
  type: "percent",
  value: "",
  minSubtotalRupees: "",
  startsAt: "",
  endsAt: "",
  usageLimit: "",
  collectionId: "",
});

const discountToFormValues = (d: Discount): Record<string, unknown> => ({
  code: d.code,
  type: d.type,
  // For fixed: API stores paise, UI shows rupees.
  value: d.type === "fixed" ? d.value / 100 : d.value,
  minSubtotalRupees: d.minSubtotalPaise > 0 ? d.minSubtotalPaise / 100 : "",
  startsAt: d.startsAt ? new Date(d.startsAt).toISOString().slice(0, 16) : "",
  endsAt: d.endsAt ? new Date(d.endsAt).toISOString().slice(0, 16) : "",
  usageLimit: d.usageLimit ?? "",
  collectionId: d.collectionId ?? "",
});

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminDiscountsPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<Discount | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, unknown>>(emptyFormValues);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [editFormValues, setEditFormValues] = useState<Record<string, unknown>>({});
  const [editFormErrors, setEditFormErrors] = useState<Record<string, string>>({});
  const [isEditSaving, setIsEditSaving] = useState(false);

  const {
    data: discountList = [],
    isLoading,
    error: loadError,
    refetch,
  } = useQuery<Discount[]>({
    queryKey: ["admin-discounts"],
    queryFn: async () => {
      const res = await fetch("/api/v2/admin/discounts");
      if (!res.ok) throw new Error(await readErrorMessage(res));
      return (await res.json()) as Discount[];
    },
  });

  const resetForm = () => {
    setFormValues(emptyFormValues());
    setFormErrors({});
  };

  // Client-side validation before submitting.
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    const code = String(formValues.code ?? "").trim();
    if (!code) errors.code = "Code is required.";

    const parsedValue = Number(formValues.value);
    if (!Number.isFinite(parsedValue) || parsedValue < 0) {
      errors.value = "Value must be a non-negative number.";
    } else if (formValues.type === "percent" && parsedValue > 100) {
      errors.value = "Percent value must be between 0 and 100.";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const buildDiscountBody = (vals: Record<string, unknown>): Record<string, unknown> => {
    const parsedValue = Number(vals.value);
    const minSubtotalRupees = Number(vals.minSubtotalRupees ?? 0) || 0;
    const minSubtotalPaise = Math.round(minSubtotalRupees * 100);
    const valueToSend =
      vals.type === "fixed" ? Math.round(parsedValue * 100) : Math.round(parsedValue);

    const body: Record<string, unknown> = {
      code: String(vals.code).trim().toUpperCase(),
      type: vals.type,
      value: valueToSend,
      minSubtotalPaise,
    };
    const startsAtStr = String(vals.startsAt ?? "").trim();
    const endsAtStr = String(vals.endsAt ?? "").trim();
    const usageLimitRaw = vals.usageLimit;
    const collectionIdStr = String(vals.collectionId ?? "").trim();

    if (startsAtStr) body.startsAt = new Date(startsAtStr).toISOString();
    if (endsAtStr) body.endsAt = new Date(endsAtStr).toISOString();
    if (usageLimitRaw !== "" && usageLimitRaw !== undefined && usageLimitRaw !== null) {
      const lim = Number(usageLimitRaw);
      if (Number.isFinite(lim) && lim > 0) body.usageLimit = Math.round(lim);
    }
    if (collectionIdStr) body.collectionId = collectionIdStr;

    return body;
  };

  const handleCreate = async () => {
    if (!validateForm()) return;

    setIsSaving(true);
    try {
      const res = await fetch("/api/v2/admin/discounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildDiscountBody(formValues)),
      });

      if (!res.ok) {
        const errData = (await res.json()) as { code?: string; message?: string };
        setFormErrors({ code: errData.message ?? `Request failed (${res.status})` });
        return;
      }

      toast.success("Discount created.");
      resetForm();
      setIsCreateOpen(false);
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to create discount.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingDiscount) return;

    setIsEditSaving(true);
    setEditFormErrors({});
    try {
      const res = await fetch(`/api/v2/admin/discounts/${editingDiscount.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildDiscountBody(editFormValues)),
      });

      if (!res.ok) {
        const errData = (await res.json()) as { code?: string; message?: string };
        setEditFormErrors({ code: errData.message ?? `Request failed (${res.status})` });
        return;
      }

      toast.success("Discount updated.");
      setEditingDiscount(null);
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to update discount.");
    } finally {
      setIsEditSaving(false);
    }
  };

  const handleToggleActive = async (discount: Discount) => {
    setTogglingId(discount.id);
    try {
      const res = await fetch(`/api/v2/admin/discounts/${discount.id}/toggle-active`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !discount.active }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res));
      toast.success(discount.active ? "Discount deactivated." : "Discount activated.");
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to toggle discount.");
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (discount: Discount) => {
    setDeletingId(discount.id);
    try {
      const res = await fetch(`/api/v2/admin/discounts/${discount.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await readErrorMessage(res));
      toast.success("Discount deleted.");
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to delete discount.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Promotions
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Discount Codes</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Create and manage discount codes. Codes are validated server-side — customers
            enter a code at checkout and the server computes the authoritative discount amount.
          </p>
        </div>

        {/*
         * SCHEMA_FORM_DISCOUNTS_ADMIN
         * DISCOUNT_SCHEMA_DRIVEN
         * SchemaForm renders all discount fields from discountFormSchema — no
         * hand-assembled per-field UI. Adding a field to discountFormSchema renders
         * it here automatically.
         */}
        <Dialog
          open={isCreateOpen}
          onOpenChange={(open) => {
            setIsCreateOpen(open);
            if (!open) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button className="gap-2 rounded-full">
              <Plus className="h-4 w-4" />
              Add discount
            </Button>
          </DialogTrigger>

          <DialogContent className="border-border/70 bg-card sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>New discount code</DialogTitle>
              <DialogDescription>
                The code is stored and compared in uppercase. Customers can enter it in any
                case at checkout. For fixed discounts, enter the amount in rupees (₹).
              </DialogDescription>
            </DialogHeader>

            <SchemaForm
              className="grid gap-4 sm:grid-cols-2"
              errors={formErrors}
              getFieldClassName={(key) =>
                discountFormFullWidthKeys.has(key) ? "col-span-full" : undefined
              }
              onChange={(key, value) =>
                setFormValues((prev) => ({ ...prev, [key]: value }))
              }
              schema={discountFormSchema}
              values={formValues}
            />

            <DialogFooter>
              <Button
                disabled={isSaving}
                onClick={() => void handleCreate()}
                type="button"
              >
                {isSaving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                Create discount
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      <Card className="border-border/70 bg-card/85 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-muted-foreground" />
            <CardTitle>All discount codes</CardTitle>
          </div>
          <CardDescription>
            {isLoading
              ? "Loading discounts..."
              : `${discountList.length} discount code${discountList.length === 1 ? "" : "s"} configured.`}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-xl" />
              ))}
            </div>
          ) : loadError ? (
            <div className="rounded-xl border border-dashed border-destructive/40 bg-destructive/5 p-4">
              <p className="text-sm text-foreground">
                {loadError instanceof Error ? loadError.message : "Unable to load discounts."}
              </p>
              <Button
                className="mt-3 rounded-full"
                onClick={() => void refetch()}
                size="sm"
                type="button"
                variant="outline"
              >
                Retry
              </Button>
            </div>
          ) : discountList.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 bg-background/70 p-6 text-center">
              <Tag className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="mt-3 text-base font-medium text-foreground">No discounts yet</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Add a discount code to offer customers a price reduction at checkout.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Min order</TableHead>
                  <TableHead>Validity</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {discountList.map((discount) => (
                  <TableRow key={discount.id} className={discount.active ? "" : "opacity-50"}>
                    <TableCell className="font-mono font-semibold text-sm">
                      {discount.code}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatValue(discount.type, discount.value)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {discount.minSubtotalPaise > 0
                        ? formatCurrency(discount.minSubtotalPaise / 100)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatWindow(discount.startsAt, discount.endsAt)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {discount.usageCount}
                      {discount.usageLimit !== null ? ` / ${discount.usageLimit}` : ""}
                    </TableCell>
                    <TableCell>
                      <Badge variant={discount.active ? "default" : "secondary"}>
                        {discount.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          onClick={() => {
                            setEditingDiscount(discount);
                            setEditFormValues(discountToFormValues(discount));
                            setEditFormErrors({});
                          }}
                          size="sm"
                          type="button"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <Button
                          disabled={togglingId === discount.id}
                          onClick={() => void handleToggleActive(discount)}
                          size="sm"
                          type="button"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          title={discount.active ? "Deactivate" : "Activate"}
                        >
                          {togglingId === discount.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : discount.active ? (
                            <ToggleRight className="h-4 w-4 text-primary" />
                          ) : (
                            <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                        <Button
                          disabled={deletingId === discount.id}
                          onClick={() => void handleDelete(discount)}
                          size="sm"
                          type="button"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          title="Delete"
                        >
                          {deletingId === discount.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog
        open={editingDiscount !== null}
        onOpenChange={(open) => {
          if (!open) setEditingDiscount(null);
        }}
      >
        <DialogContent className="border-border/70 bg-card sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit discount code</DialogTitle>
            <DialogDescription>
              Update the discount code details. The code is stored and compared in uppercase.
              For fixed discounts, enter the amount in rupees (₹).
            </DialogDescription>
          </DialogHeader>

          <SchemaForm
            className="grid gap-4 sm:grid-cols-2"
            errors={editFormErrors}
            getFieldClassName={(key) =>
              discountFormFullWidthKeys.has(key) ? "col-span-full" : undefined
            }
            onChange={(key, value) =>
              setEditFormValues((prev) => ({ ...prev, [key]: value }))
            }
            schema={discountFormSchema}
            values={editFormValues}
          />

          <DialogFooter>
            <Button
              disabled={isEditSaving}
              onClick={() => void handleUpdate()}
              type="button"
            >
              {isEditSaving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
