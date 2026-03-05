import { notFound } from "next/navigation";

import { ProductSimilarPanel } from "@/components/admin/product-similar-panel";
import { mapProductToStepperValues, ProductStepper } from "@/components/admin/product-stepper/stepper";
import { getProduct } from "@/db/queries/products";

type EditProductPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EditProductPage({
  params,
}: EditProductPageProps) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Edit Product</h2>
        <p className="text-sm text-muted-foreground">
          Update details and publish changes.
        </p>
      </div>
      <ProductStepper
        initialValues={mapProductToStepperValues(product)}
        productId={id}
      />
      <ProductSimilarPanel productId={id} />
    </div>
  );
}
