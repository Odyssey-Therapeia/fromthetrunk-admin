import { notFound } from "next/navigation";

import { ProductSimilarPanel } from "@/components/admin/product-similar-panel";
import { ProductStepper } from "@/components/admin/product-stepper/stepper";
import {
  mapProductToStepperValues,
  type ProductStepperMedia,
} from "@/components/admin/product-stepper/types";
import { getProduct } from "@/db/queries/products";
import { resolveMediaURL } from "@/lib/media/resolve-media-url";

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

  const initialMedia = [...product.images]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ media }) => {
      const url = resolveMediaURL(media);
      if (!url) return null;

      return {
        filename: media.filename,
        id: media.id,
        url,
      };
    })
    .filter((media): media is ProductStepperMedia => Boolean(media));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Edit Product</h2>
        <p className="text-sm text-muted-foreground">
          Update details and publish changes.
        </p>
      </div>
      <ProductStepper
        initialMedia={initialMedia}
        initialValues={mapProductToStepperValues(product)}
        productId={id}
      />
      <ProductSimilarPanel productId={id} />
    </div>
  );
}
