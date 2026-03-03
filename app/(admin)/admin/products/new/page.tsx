import { ProductStepper } from "@/components/admin/product-stepper/stepper";

export default function NewProductPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Create Product</h2>
        <p className="text-sm text-muted-foreground">
          Build a sari listing with the 5-step workflow.
        </p>
      </div>
      <ProductStepper />
    </div>
  );
}
