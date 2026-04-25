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
} from "./availability";

type StepPricingProps = {
  form: any;
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

export function StepPricing({
  form,
}: StepPricingProps) {
  const handleStockStatusChange = (stockStatus: ProductStockStatus) => {
    const next = applyStockStatusChange(
      {
        reservedUntil: form.state.values.reservedUntil,
        soldAt: form.state.values.soldAt,
        stockStatus: form.state.values.stockStatus,
      },
      stockStatus
    );

    form.setFieldValue("stockStatus", next.stockStatus);
    form.setFieldValue("soldAt", next.soldAt);
    form.setFieldValue("reservedUntil", next.reservedUntil);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <form.Field name="priceRupees">
          {(field: any) => (
            <div className="space-y-2">
              <Label htmlFor="price">Price (INR)</Label>
              <Input
                id="price"
                min={0}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(Number(event.target.value))}
                type="number"
                value={field.state.value}
              />
            </div>
          )}
        </form.Field>

        <form.Field name="originalPriceRupees">
          {(field: any) => (
            <div className="space-y-2">
              <Label htmlFor="original-price">Original price (INR)</Label>
              <Input
                id="original-price"
                min={0}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(Number(event.target.value))}
                type="number"
                value={field.state.value}
              />
            </div>
          )}
        </form.Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <form.Field name="stockStatus">
          {(field: any) => {
            const stockStatus = field.state.value as ProductStockStatus;
            const selectedOption = productStockStatusOptions.find(
              (option) => option.value === stockStatus
            );
            const reservedUntilLabel = formatAvailabilityTimestamp(form.state.values.reservedUntil);
            const soldAtLabel = formatAvailabilityTimestamp(form.state.values.soldAt);

            return (
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="stock-status">Availability</Label>
                <Select
                  onValueChange={(value) => handleStockStatusChange(value as ProductStockStatus)}
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
                <div className="flex flex-col gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
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
              </div>
            );
          }}
        </form.Field>

        <form.Field name="status">
          {(field: any) => (
            <div className="space-y-2">
              <Label>Publishing status</Label>
              <Select onValueChange={field.handleChange} value={field.state.value}>
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
          {(field: any) => (
            <div className="space-y-2">
              <Label>Featured product</Label>
              <div className="flex h-10 items-center gap-3 rounded-md border px-3">
                <Switch
                  checked={Boolean(field.state.value)}
                  onCheckedChange={(checked) => field.handleChange(Boolean(checked))}
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
