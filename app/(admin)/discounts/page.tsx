"use client";

/**
 * P6-02: Admin discount codes manager.
 *
 * CRUD for the discounts table.
 * Persists via /api/v2/admin/discounts (requireAdmin gated).
 *
 * UX notes:
 * - Percent discounts accept a percentage value.
 * - Fixed discounts accept a rupee value in the UI and send paise to the API.
 * - Usage limit defaults to 1 for new coupons.
 * - Empty usage limit means unlimited.
 * - Collection scope is selected from live collections.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
  Pencil,
  Plus,
  Tag,
  Trash2,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

type CollectionOption = {
  id: string;
  name: string;
  slug: string;
};

type DiscountFormValues = {
  code: string;
  type: DiscountType;
  value: string;
  minSubtotalRupees: string;
  startsAt: string;
  endsAt: string;
  usageLimit: string;
  collectionId: string;
};

type DiscountFormErrors = Partial<Record<keyof DiscountFormValues, string>>;

type DiscountFormProps = {
  collections: CollectionOption[];
  errors: DiscountFormErrors;
  isCollectionsLoading: boolean;
  mode: "create" | "edit";
  onChange: (key: keyof DiscountFormValues, value: string) => void;
  values: DiscountFormValues;
};

const ALL_COLLECTIONS_VALUE = "__all_collections__";

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
  if (type === "percent") return `${value}% off`;
  return `${formatCurrency(value / 100)} off`;
};

const formatWindow = (
  startsAt: string | null,
  endsAt: string | null,
): string => {
  if (!startsAt && !endsAt) return "Always active";

  const start = startsAt
    ? new Date(startsAt).toLocaleDateString("en-IN")
    : "Immediate";
  const end = endsAt
    ? new Date(endsAt).toLocaleDateString("en-IN")
    : "No expiry";

  return `${start} → ${end}`;
};

const formatUsage = (usageCount: number, usageLimit: number | null): string => {
  if (usageLimit === null) return `${usageCount} / Unlimited`;
  return `${usageCount} / ${usageLimit}`;
};

const emptyFormValues = (): DiscountFormValues => ({
  code: "",
  type: "percent",
  value: "",
  minSubtotalRupees: "",
  startsAt: "",
  endsAt: "",
  usageLimit: "1",
  collectionId: ALL_COLLECTIONS_VALUE,
});

const discountToFormValues = (discount: Discount): DiscountFormValues => ({
  code: discount.code,
  type: discount.type,
  value:
    discount.type === "fixed"
      ? String(discount.value / 100)
      : String(discount.value),
  minSubtotalRupees:
    discount.minSubtotalPaise > 0
      ? String(discount.minSubtotalPaise / 100)
      : "",
  startsAt: discount.startsAt
    ? new Date(discount.startsAt).toISOString().slice(0, 16)
    : "",
  endsAt: discount.endsAt
    ? new Date(discount.endsAt).toISOString().slice(0, 16)
    : "",
  usageLimit: discount.usageLimit === null ? "" : String(discount.usageLimit),
  collectionId: discount.collectionId ?? ALL_COLLECTIONS_VALUE,
});

const isValidDateTimeLocal = (value: string) => {
  if (!value) return true;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
};

const validateDiscountForm = (
  values: DiscountFormValues,
): DiscountFormErrors => {
  const errors: DiscountFormErrors = {};
  const code = values.code.trim();
  const rawValue = values.value.trim();
  const parsedValue = Number(rawValue);
  const minSubtotalRaw = values.minSubtotalRupees.trim();
  const usageLimitRaw = values.usageLimit.trim();

  if (!code) {
    errors.code = "Discount code is required.";
  } else if (/\s/.test(code)) {
    errors.code = "Use one code without spaces, for example FTT10.";
  }

  if (!rawValue) {
    errors.value =
      values.type === "percent"
        ? "Enter the percentage discount."
        : "Enter the rupee amount.";
  } else if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    errors.value =
      values.type === "percent"
        ? "Percent discount must be greater than 0."
        : "Amount discount must be greater than ₹0.";
  } else if (values.type === "percent" && parsedValue > 100) {
    errors.value = "Percent discount must be between 1 and 100.";
  }

  if (minSubtotalRaw) {
    const minSubtotal = Number(minSubtotalRaw);
    if (!Number.isFinite(minSubtotal) || minSubtotal < 0) {
      errors.minSubtotalRupees = "Minimum order amount must be ₹0 or more.";
    }
  }

  if (usageLimitRaw) {
    const usageLimit = Number(usageLimitRaw);
    if (
      !Number.isFinite(usageLimit) ||
      usageLimit < 1 ||
      !Number.isInteger(usageLimit)
    ) {
      errors.usageLimit = "Usage limit must be a whole number of 1 or more.";
    }
  }

  if (!isValidDateTimeLocal(values.startsAt)) {
    errors.startsAt = "Enter a valid start date and time.";
  }

  if (!isValidDateTimeLocal(values.endsAt)) {
    errors.endsAt = "Enter a valid expiry date and time.";
  }

  if (values.startsAt && values.endsAt) {
    const start = new Date(values.startsAt);
    const end = new Date(values.endsAt);
    if (end <= start) {
      errors.endsAt = "Expiry must be after the start date.";
    }
  }

  return errors;
};

const buildDiscountBody = (
  values: DiscountFormValues,
  options: { includeNulls: boolean },
): Record<string, unknown> => {
  const parsedValue = Number(values.value);
  const minSubtotalRupees = Number(values.minSubtotalRupees || 0);
  const usageLimitRaw = values.usageLimit.trim();
  const startsAtRaw = values.startsAt.trim();
  const endsAtRaw = values.endsAt.trim();
  const collectionId =
    values.collectionId === ALL_COLLECTIONS_VALUE ? "" : values.collectionId;

  const body: Record<string, unknown> = {
    code: values.code.trim().toUpperCase(),
    type: values.type,
    value:
      values.type === "fixed"
        ? Math.round(parsedValue * 100)
        : Math.round(parsedValue),
    minSubtotalPaise: Math.round(minSubtotalRupees * 100),
  };

  if (startsAtRaw) {
    body.startsAt = new Date(startsAtRaw).toISOString();
  } else if (options.includeNulls) {
    body.startsAt = null;
  }

  if (endsAtRaw) {
    body.endsAt = new Date(endsAtRaw).toISOString();
  } else if (options.includeNulls) {
    body.endsAt = null;
  }

  if (usageLimitRaw) {
    body.usageLimit = Math.round(Number(usageLimitRaw));
  } else if (options.includeNulls) {
    body.usageLimit = null;
  }

  if (collectionId) {
    body.collectionId = collectionId;
  } else if (options.includeNulls) {
    body.collectionId = null;
  }

  return body;
};

// ── Form ──────────────────────────────────────────────────────────────────────

function DiscountForm({
  collections,
  errors,
  isCollectionsLoading,
  mode,
  onChange,
  values,
}: DiscountFormProps) {
  const isPercent = values.type === "percent";
  const valueLabel = isPercent ? "Percent off (%)" : "Amount off (₹)";
  const valuePlaceholder = isPercent ? "e.g. 10" : "e.g. 500";
  const valueDescription = isPercent
    ? "Enter a number from 1 to 100."
    : "Enter the fixed discount amount in rupees. The API stores it as paise.";

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border/70 bg-background/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Coupon setup
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          The code is stored in uppercase. Customers can enter it in any case.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor={`${mode}-discount-code`}>Discount code</Label>
            <Input
              id={`${mode}-discount-code`}
              onChange={(event) =>
                onChange("code", event.target.value.toUpperCase())
              }
              placeholder="e.g. FTT10"
              value={values.code}
            />
            {errors.code ? (
              <p className="text-xs text-destructive">{errors.code}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Example: FTT10, FIRSTTRUNK, SAREE500.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Discount type</Label>
            <Select
              onValueChange={(value) => onChange("type", value)}
              value={values.type}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">Percentage off</SelectItem>
                <SelectItem value="fixed">Fixed amount off</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Choose whether the code applies a percentage or rupee amount.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${mode}-discount-value`}>{valueLabel}</Label>
            <Input
              id={`${mode}-discount-value`}
              inputMode="decimal"
              max={isPercent ? 100 : undefined}
              min={1}
              onChange={(event) => onChange("value", event.target.value)}
              placeholder={valuePlaceholder}
              step={isPercent ? 1 : 1}
              type="number"
              value={values.value}
            />
            {errors.value ? (
              <p className="text-xs text-destructive">{errors.value}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {valueDescription}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border/70 bg-background/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Eligibility
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Control where the code can be used and how many times it can be
          redeemed.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${mode}-min-subtotal`}>
              Minimum order amount (₹)
            </Label>
            <Input
              id={`${mode}-min-subtotal`}
              inputMode="decimal"
              min={0}
              onChange={(event) =>
                onChange("minSubtotalRupees", event.target.value)
              }
              placeholder="Blank means no minimum"
              type="number"
              value={values.minSubtotalRupees}
            />
            {errors.minSubtotalRupees ? (
              <p className="text-xs text-destructive">
                {errors.minSubtotalRupees}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Leave blank for no minimum order value.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Collection scope</Label>
            <Select
              disabled={isCollectionsLoading}
              onValueChange={(value) => onChange("collectionId", value)}
              value={values.collectionId}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    isCollectionsLoading
                      ? "Loading collections..."
                      : "All collections"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_COLLECTIONS_VALUE}>
                  All collections
                </SelectItem>
                {collections.map((collection) => (
                  <SelectItem key={collection.id} value={collection.id}>
                    {collection.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Restrict this code to products inside one collection, or leave it
              open to all.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${mode}-usage-limit`}>Usage limit</Label>
            <Input
              id={`${mode}-usage-limit`}
              inputMode="numeric"
              min={1}
              onChange={(event) => onChange("usageLimit", event.target.value)}
              placeholder="Blank means unlimited"
              step={1}
              type="number"
              value={values.usageLimit}
            />
            {errors.usageLimit ? (
              <p className="text-xs text-destructive">{errors.usageLimit}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                New coupons default to 1 use. Clear this field for unlimited
                redemptions.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border/70 bg-background/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Schedule
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Optional start and expiry window. Leave blank for immediate and always
          active.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${mode}-starts-at`}>Active from</Label>
            <Input
              id={`${mode}-starts-at`}
              onChange={(event) => onChange("startsAt", event.target.value)}
              type="datetime-local"
              value={values.startsAt}
            />
            {errors.startsAt ? (
              <p className="text-xs text-destructive">{errors.startsAt}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Leave blank for immediate activation.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${mode}-ends-at`}>Expires at</Label>
            <Input
              id={`${mode}-ends-at`}
              onChange={(event) => onChange("endsAt", event.target.value)}
              type="datetime-local"
              value={values.endsAt}
            />
            {errors.endsAt ? (
              <p className="text-xs text-destructive">{errors.endsAt}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Leave blank for no expiry.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminDiscountsPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<Discount | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditSaving, setIsEditSaving] = useState(false);
  const [formValues, setFormValues] = useState<DiscountFormValues>(() =>
    emptyFormValues(),
  );
  const [formErrors, setFormErrors] = useState<DiscountFormErrors>({});
  const [editFormValues, setEditFormValues] = useState<DiscountFormValues>(() =>
    emptyFormValues(),
  );
  const [editFormErrors, setEditFormErrors] = useState<DiscountFormErrors>({});

  const {
    data: discountList = [],
    isLoading,
    error: loadError,
    refetch,
  } = useQuery<Discount[]>({
    queryKey: ["admin-discounts"],
    queryFn: async () => {
      const response = await fetch("/api/v2/admin/discounts");
      if (!response.ok) throw new Error(await readErrorMessage(response));
      return (await response.json()) as Discount[];
    },
  });

  const {
    data: collections = [],
    isLoading: isCollectionsLoading,
    error: collectionsError,
  } = useQuery<CollectionOption[]>({
    queryKey: ["admin-discount-collections"],
    queryFn: async () => {
      const response = await fetch("/api/v2/collections");
      if (!response.ok) throw new Error(await readErrorMessage(response));
      return (await response.json()) as CollectionOption[];
    },
  });

  const collectionNameById = useMemo(
    () =>
      new Map(
        collections.map(
          (collection) => [collection.id, collection.name] as const,
        ),
      ),
    [collections],
  );

  const metrics = useMemo(
    () => ({
      active: discountList.filter((discount) => discount.active).length,
      inactive: discountList.filter((discount) => !discount.active).length,
      scoped: discountList.filter((discount) => discount.collectionId).length,
      total: discountList.length,
    }),
    [discountList],
  );

  const resetCreateForm = () => {
    setFormValues(emptyFormValues());
    setFormErrors({});
  };

  const closeEditDialog = () => {
    setEditingDiscount(null);
    setEditFormValues(emptyFormValues());
    setEditFormErrors({});
  };

  const updateCreateValue = (key: keyof DiscountFormValues, value: string) => {
    setFormValues((prev) => {
      if (key === "type") {
        return {
          ...prev,
          type: value as DiscountType,
          value: "",
        };
      }

      return {
        ...prev,
        [key]: value,
      };
    });

    setFormErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const updateEditValue = (key: keyof DiscountFormValues, value: string) => {
    setEditFormValues((prev) => {
      if (key === "type") {
        return {
          ...prev,
          type: value as DiscountType,
          value: "",
        };
      }

      return {
        ...prev,
        [key]: value,
      };
    });

    setEditFormErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const getCollectionLabel = (collectionId: string | null) => {
    if (!collectionId) return "All collections";
    return collectionNameById.get(collectionId) ?? collectionId;
  };

  const handleCreate = async () => {
    const errors = validateDiscountForm(formValues);
    setFormErrors(errors);

    if (Object.keys(errors).length > 0) return;

    setIsSaving(true);

    try {
      const response = await fetch("/api/v2/admin/discounts", {
        body: JSON.stringify(
          buildDiscountBody(formValues, { includeNulls: false }),
        ),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        setFormErrors({
          code: await readErrorMessage(response),
        });
        return;
      }

      toast.success("Discount created.");
      resetCreateForm();
      setIsCreateOpen(false);
      await refetch();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to create discount.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingDiscount) return;

    const errors = validateDiscountForm(editFormValues);
    setEditFormErrors(errors);

    if (Object.keys(errors).length > 0) return;

    setIsEditSaving(true);

    try {
      const response = await fetch(
        `/api/v2/admin/discounts/${editingDiscount.id}`,
        {
          body: JSON.stringify(
            buildDiscountBody(editFormValues, { includeNulls: true }),
          ),
          headers: { "Content-Type": "application/json" },
          method: "PATCH",
        },
      );

      if (!response.ok) {
        setEditFormErrors({
          code: await readErrorMessage(response),
        });
        return;
      }

      toast.success("Discount updated.");
      closeEditDialog();
      await refetch();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to update discount.",
      );
    } finally {
      setIsEditSaving(false);
    }
  };

  const handleToggleActive = async (discount: Discount) => {
    setTogglingId(discount.id);

    try {
      const response = await fetch(
        `/api/v2/admin/discounts/${discount.id}/toggle-active`,
        {
          body: JSON.stringify({ active: !discount.active }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );

      if (!response.ok) throw new Error(await readErrorMessage(response));

      toast.success(
        discount.active ? "Discount deactivated." : "Discount activated.",
      );
      await refetch();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to toggle discount.",
      );
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (discount: Discount) => {
    if (!window.confirm(`Delete discount code ${discount.code}?`)) return;

    setDeletingId(discount.id);

    try {
      const response = await fetch(`/api/v2/admin/discounts/${discount.id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error(await readErrorMessage(response));

      toast.success("Discount deleted.");
      await refetch();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to delete discount.",
      );
    } finally {
      setDeletingId(null);
    }
  };

  const openEditDialog = (discount: Discount) => {
    setEditingDiscount(discount);
    setEditFormValues(discountToFormValues(discount));
    setEditFormErrors({});
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Promotions
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">
            Discount Codes
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Create percentage or fixed-amount coupons, limit usage, and scope
            discounts to specific collections. Checkout still validates and
            computes the final discount server-side.
          </p>
        </div>

        <Dialog
          open={isCreateOpen}
          onOpenChange={(open) => {
            setIsCreateOpen(open);
            if (!open) resetCreateForm();
          }}
        >
          <DialogTrigger asChild>
            <Button className="gap-2 rounded-full">
              <Plus className="h-4 w-4" />
              Add discount
            </Button>
          </DialogTrigger>

          <DialogContent className="max-h-[90vh] overflow-y-auto border-border/70 bg-card sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>New discount code</DialogTitle>
              <DialogDescription>
                Start with a one-time coupon by default. You can change the
                usage limit or clear it for unlimited redemptions.
              </DialogDescription>
            </DialogHeader>

            {collectionsError ? (
              <div className="rounded-xl border border-dashed border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                {collectionsError instanceof Error
                  ? collectionsError.message
                  : "Unable to load collections for scoping."}
              </div>
            ) : null}

            <DiscountForm
              collections={collections}
              errors={formErrors}
              isCollectionsLoading={isCollectionsLoading}
              mode="create"
              onChange={updateCreateValue}
              values={formValues}
            />

            <DialogFooter>
              <Button
                disabled={isSaving}
                onClick={() => void handleCreate()}
                type="button"
              >
                {isSaving ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : null}
                Create discount
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Total codes", metrics.total],
          ["Active", metrics.active],
          ["Inactive", metrics.inactive],
          ["Collection scoped", metrics.scoped],
        ].map(([label, value]) => (
          <Card className="border-border/70 bg-card/85 shadow-sm" key={label}>
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {label}
              </p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/70 bg-card/85 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-muted-foreground" />
            <CardTitle>All discount codes</CardTitle>
          </div>
          <CardDescription>
            {isLoading
              ? "Loading discounts..."
              : `${discountList.length} discount code${
                  discountList.length === 1 ? "" : "s"
                } configured.`}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton
                  className="h-10 w-full rounded-xl"
                  key={`discount-skeleton-${index}`}
                />
              ))}
            </div>
          ) : loadError ? (
            <div className="rounded-xl border border-dashed border-destructive/40 bg-destructive/5 p-4">
              <p className="text-sm text-foreground">
                {loadError instanceof Error
                  ? loadError.message
                  : "Unable to load discounts."}
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
              <p className="mt-3 text-base font-medium text-foreground">
                No discounts yet
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Add your first discount code for checkout.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Min order</TableHead>
                  <TableHead>Validity</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-56">Actions</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {discountList.map((discount) => {
                  const usageReached =
                    discount.usageLimit !== null &&
                    discount.usageCount >= discount.usageLimit;

                  return (
                    <TableRow
                      className={discount.active ? "" : "opacity-60"}
                      key={discount.id}
                    >
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-mono text-sm font-semibold">
                            {discount.code}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Created{" "}
                            {new Date(discount.createdAt).toLocaleDateString(
                              "en-IN",
                            )}
                          </p>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="space-y-1">
                          <p className="text-sm font-medium">
                            {formatValue(discount.type, discount.value)}
                          </p>
                          <Badge variant="secondary">
                            {discount.type === "percent"
                              ? "Percentage"
                              : "Fixed amount"}
                          </Badge>
                        </div>
                      </TableCell>

                      <TableCell className="max-w-48 text-sm text-muted-foreground">
                        <span className="line-clamp-2">
                          {getCollectionLabel(discount.collectionId)}
                        </span>
                      </TableCell>

                      <TableCell className="text-sm text-muted-foreground">
                        {discount.minSubtotalPaise > 0
                          ? formatCurrency(discount.minSubtotalPaise / 100)
                          : "No minimum"}
                      </TableCell>

                      <TableCell className="text-xs text-muted-foreground">
                        {formatWindow(discount.startsAt, discount.endsAt)}
                      </TableCell>

                      <TableCell>
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">
                            {formatUsage(
                              discount.usageCount,
                              discount.usageLimit,
                            )}
                          </p>
                          {usageReached ? (
                            <Badge variant="secondary">Limit reached</Badge>
                          ) : null}
                        </div>
                      </TableCell>

                      <TableCell>
                        <Badge
                          variant={discount.active ? "default" : "secondary"}
                        >
                          {discount.active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          <Button
                            className="gap-1"
                            onClick={() => openEditDialog(discount)}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            <Pencil className="h-4 w-4" />
                            Edit
                          </Button>

                          <Button
                            className="gap-1"
                            disabled={togglingId === discount.id}
                            onClick={() => void handleToggleActive(discount)}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            {togglingId === discount.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : discount.active ? (
                              <ToggleRight className="h-4 w-4 text-primary" />
                            ) : (
                              <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                            )}
                            {discount.active ? "Pause" : "Activate"}
                          </Button>

                          <Button
                            className="gap-1 text-destructive hover:text-destructive"
                            disabled={deletingId === discount.id}
                            onClick={() => void handleDelete(discount)}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            {deletingId === discount.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={editingDiscount !== null}
        onOpenChange={(open) => {
          if (!open) closeEditDialog();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto border-border/70 bg-card sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit discount code</DialogTitle>
            <DialogDescription>
              Update coupon value, schedule, usage, activation, or collection
              scope.
            </DialogDescription>
          </DialogHeader>

          {collectionsError ? (
            <div className="rounded-xl border border-dashed border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {collectionsError instanceof Error
                ? collectionsError.message
                : "Unable to load collections for scoping."}
            </div>
          ) : null}

          <DiscountForm
            collections={collections}
            errors={editFormErrors}
            isCollectionsLoading={isCollectionsLoading}
            mode="edit"
            onChange={updateEditValue}
            values={editFormValues}
          />

          <DialogFooter>
            <Button
              disabled={isEditSaving}
              onClick={() => void handleUpdate()}
              type="button"
            >
              {isEditSaving ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : null}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
