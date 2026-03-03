import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";

type StepPricingProps = {
  form: any;
};

export function StepPricing({
  form,
}: StepPricingProps) {
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
