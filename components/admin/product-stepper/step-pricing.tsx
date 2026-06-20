"use client";

import { useState } from "react";
import type {
  FormAsyncValidateOrFn,
  FormValidateOrFn,
  ReactFormExtendedApi,
} from "@tanstack/react-form";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import {
  applyStockStatusChange,
  productStockStatusLabels,
  productStockStatusOptions,
  type ProductStockStatus,
  validateReservedUntil,
} from "./availability";
import type { ProductStepperValues } from "./types";

type ProductStepperSyncValidator =
  | FormValidateOrFn<ProductStepperValues>
  | undefined;
type ProductStepperAsyncValidator =
  | FormAsyncValidateOrFn<ProductStepperValues>
  | undefined;

type ProductStepperForm = ReactFormExtendedApi<
  ProductStepperValues,
  ProductStepperSyncValidator,
  ProductStepperSyncValidator,
  ProductStepperAsyncValidator,
  ProductStepperSyncValidator,
  ProductStepperAsyncValidator,
  ProductStepperSyncValidator,
  ProductStepperAsyncValidator,
  ProductStepperSyncValidator,
  ProductStepperAsyncValidator,
  ProductStepperAsyncValidator,
  unknown
>;

type StepPricingProps = {
  form: ProductStepperForm;
};

const formatAvailabilityTimestamp = (value: null | string) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const toDateTimeLocalValue = (value: null | string) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (part: number) => String(part).padStart(2, "0");
  return (
    [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join(
      "-",
    ) + `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
};

const toIsoTimestamp = (value: string) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const getErrorMessage = (error: unknown) =>
  typeof error === "string" ? error : undefined;

const isProductStockStatus = (value: unknown): value is ProductStockStatus =>
  typeof value === "string" && value in productStockStatusLabels;

const isPublishingStatus = (
  value: unknown,
): value is ProductStepperValues["status"] =>
  value === "draft" || value === "published";

/**
 * A number input backed by a local string buffer.
 *
 * A directly-controlled `type="number"` input can't be cleared: deleting the
 * leading 0 produces "", `Number("")` is 0, and the controlled value snaps the
 * text straight back to "0" (decimals break the same way — `Number("12.")` is 12,
 * so the dot is wiped mid-type). Holding the raw text locally fixes both: the
 * numeric *model* stays a plain number, but the *displayed text* can be empty,
 * mid-decimal ("12."), etc.
 *
 * External changes to `value` (product load, reset, AI assist) are re-synced into
 * the text during render — the same "adjust state on prop change" pattern used in
 * stepper.tsx — so this never calls setState inside an effect.
 */
function NumberInput({
  id,
  value,
  onValueChange,
  onBlur,
}: {
  id?: string;
  value: number;
  onValueChange: (value: number) => void;
  onBlur?: () => void;
}) {
  const [text, setText] = useState(() => (value === 0 ? "" : String(value)));
  const [lastValue, setLastValue] = useState(value);

  if (value !== lastValue) {
    setLastValue(value);
    const parsed = text.trim() === "" ? 0 : Number(text);
    // Only overwrite the buffer when `value` changed from outside — not as a
    // result of our own edit (where the buffer already parses to `value`).
    if (!Number.isFinite(parsed) || parsed !== value) {
      setText(value === 0 ? "" : String(value));
    }
  }

  return (
    <Input
      id={id}
      inputMode="decimal"
      onBlur={onBlur}
      onChange={(event) => {
        // Allow only digits and a single decimal point.
        const cleaned = event.target.value.replace(/[^0-9.]/g, "");
        const dot = cleaned.indexOf(".");
        const next =
          dot === -1
            ? cleaned
            : cleaned.slice(0, dot + 1) +
              cleaned.slice(dot + 1).replace(/\./g, "");
        setText(next);
        const parsed = next === "" ? 0 : Number(next);
        if (Number.isFinite(parsed)) onValueChange(parsed);
      }}
      type="text"
      value={text}
    />
  );
}

type AvailabilityFieldsProps = {
  form: ProductStepperForm;
  onStockStatusChange: (stockStatus: ProductStockStatus) => void;
  stockStatus: ProductStockStatus;
};

function AvailabilityFields({
  form,
  onStockStatusChange,
  stockStatus,
}: AvailabilityFieldsProps) {
  const selectedOption = productStockStatusOptions.find(
    (option) => option.value === stockStatus,
  );
  const reservedUntilLabel = formatAvailabilityTimestamp(
    form.state.values.reservedUntil,
  );
  const soldAtLabel = formatAvailabilityTimestamp(form.state.values.soldAt);

  return (
    <div className="space-y-2 @md:col-span-2">
      <Label htmlFor="stock-status">Availability</Label>
      <Select
        onValueChange={(value) => {
          if (isProductStockStatus(value)) {
            onStockStatusChange(value);
          }
        }}
        value={stockStatus}
      >
        <SelectTrigger id="stock-status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {productStockStatusOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex flex-col gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground @sm:flex-row @sm:items-center @sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={stockStatus === "sold" ? "destructive" : "outline"}
            className={
              stockStatus === "reserved"
                ? "border-amber-300 bg-amber-50 text-amber-700"
                : undefined
            }
          >
            {productStockStatusLabels[stockStatus]}
          </Badge>
          <span>{selectedOption?.description}</span>
        </div>
        {stockStatus === "sold" && soldAtLabel ? (
          <span>Sold at {soldAtLabel}</span>
        ) : null}
        {stockStatus === "reserved" && reservedUntilLabel ? (
          <span>Reserved until {reservedUntilLabel}</span>
        ) : null}
      </div>
      {stockStatus === "reserved" ? (
        <form.Field
          name="reservedUntil"
          validators={{
            onBlur: ({ value }) => validateReservedUntil(value),
            onChange: ({ value }) => validateReservedUntil(value),
            onSubmit: ({ value }) => validateReservedUntil(value),
          }}
        >
          {(reservedField) => {
            const reservedUntilError = getErrorMessage(
              reservedField.state.meta.errors[0],
            );

            return (
              <div className="grid gap-2 rounded-xl border border-border/70 bg-background/70 p-3 @sm:max-w-sm">
                <Label htmlFor="reserved-until">Reserved until</Label>
                <Input
                  aria-describedby="reserved-until-help reserved-until-error"
                  aria-invalid={Boolean(reservedUntilError)}
                  id="reserved-until"
                  min={toDateTimeLocalValue(new Date().toISOString())}
                  onBlur={reservedField.handleBlur}
                  onChange={(event) =>
                    reservedField.handleChange(
                      toIsoTimestamp(event.target.value),
                    )
                  }
                  type="datetime-local"
                  value={toDateTimeLocalValue(reservedField.state.value)}
                />
                <p
                  className="text-xs leading-5 text-muted-foreground"
                  id="reserved-until-help"
                >
                  Leave blank for a manual hold without an expiry.
                </p>
                {reservedUntilError ? (
                  <p
                    className="text-xs leading-5 text-destructive"
                    id="reserved-until-error"
                  >
                    {reservedUntilError}
                  </p>
                ) : null}
              </div>
            );
          }}
        </form.Field>
      ) : null}
    </div>
  );
}

export function StepPricing({ form }: StepPricingProps) {
  const handleStockStatusChange = (stockStatus: ProductStockStatus) => {
    const next = applyStockStatusChange(
      {
        reservedUntil: form.state.values.reservedUntil,
        soldAt: form.state.values.soldAt,
        stockStatus: form.state.values.stockStatus,
      },
      stockStatus,
    );

    form.setFieldValue("stockStatus", next.stockStatus);
    form.setFieldValue("soldAt", next.soldAt);
    form.setFieldValue("reservedUntil", next.reservedUntil);
  };

  return (
    <div className="@container space-y-4">
      <div className="grid gap-4 @md:grid-cols-2">
        <form.Field name="priceRupees">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="price">Price (INR)</Label>
              <NumberInput
                id="price"
                onBlur={field.handleBlur}
                onValueChange={(value) => field.handleChange(value)}
                value={field.state.value}
              />
            </div>
          )}
        </form.Field>

        <form.Field name="originalPriceRupees">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="original-price">Original price (INR)</Label>
              <NumberInput
                id="original-price"
                onBlur={field.handleBlur}
                onValueChange={(value) => field.handleChange(value)}
                value={field.state.value}
              />
            </div>
          )}
        </form.Field>
      </div>

      <div className="grid gap-4 @md:grid-cols-2">
        <form.Field name="stockStatus">
          {(field) => (
            <AvailabilityFields
              form={form}
              onStockStatusChange={handleStockStatusChange}
              stockStatus={
                isProductStockStatus(field.state.value)
                  ? field.state.value
                  : "available"
              }
            />
          )}
        </form.Field>

        <form.Field name="status">
          {(field) => (
            <div className="space-y-2">
              <Label>Publishing status</Label>
              <Select
                onValueChange={(value) => {
                  if (isPublishingStatus(value)) {
                    field.handleChange(value);
                  }
                }}
                value={field.state.value}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </form.Field>

        <form.Field name="featured">
          {(field) => (
            <div className="space-y-2">
              <Label>Featured product</Label>
              <div className="flex h-10 items-center gap-3 rounded-md border px-3">
                <Switch
                  checked={Boolean(field.state.value)}
                  onCheckedChange={(checked) =>
                    field.handleChange(Boolean(checked))
                  }
                />
                <span className="text-sm text-muted-foreground">
                  Highlight in featured collections
                </span>
              </div>
            </div>
          )}
        </form.Field>
      </div>
    </div>
  );
}
