import Image from "next/image";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR, toPaise } from "@/db/money";

import { productStockStatusLabels } from "./availability";
import type { ProductStepperValues } from "./types";

type LivePreviewCardProps = {
  imageUrls?: Array<{
    id: string;
    url: string;
  }>;
  values: ProductStepperValues;
};

export function LivePreviewCard({
  imageUrls = [],
  values,
}: LivePreviewCardProps) {
  const coverImage = imageUrls[0] ?? null;
  const imageCountLabel = imageUrls.length > 1 ? `1 of ${imageUrls.length}` : null;
  const originalPriceLabel =
    values.originalPriceRupees > 0 ? formatINR(toPaise(values.originalPriceRupees)) : null;
  const previewTitle = values.name || values.storyTitle || "Untitled Product";
  const priceLabel = formatINR(toPaise(values.priceRupees || 0));
  const statusLabel = values.status === "published" ? "Published" : "Draft";
  const stockStatusLabel = productStockStatusLabels[values.stockStatus];

  return (
    <Card className="sticky top-24">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg">Live Preview</CardTitle>
        <div className="flex flex-wrap justify-end gap-1.5">
          <Badge variant={values.status === "published" ? "default" : "secondary"}>
            {statusLabel}
          </Badge>
          {values.stockStatus !== "available" ? (
            <Badge variant={values.stockStatus === "sold" ? "destructive" : "outline"}>
              {stockStatusLabel}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {coverImage ? (
          <div className="relative aspect-[4/5] overflow-hidden rounded-md border">
            <Image
              alt={previewTitle}
              src={coverImage.url}
              fill
              sizes="320px"
              className="object-cover"
            />
            {imageCountLabel ? (
              <Badge className="absolute left-2 top-2" variant="secondary">
                {imageCountLabel}
              </Badge>
            ) : null}
          </div>
        ) : (
          <div className="flex aspect-[4/5] items-center justify-center rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 px-4 text-center text-xs text-muted-foreground">
            Upload photos to see the cover image update live.
          </div>
        )}
        <div className="space-y-2">
          <p className="line-clamp-1 text-sm font-semibold">{previewTitle}</p>
          <p className="line-clamp-1 text-xs text-muted-foreground">
            {values.detailsFabric || "Fabric details pending"}
          </p>
          {values.detailsDesigner ? (
            <p className="line-clamp-1 text-xs text-muted-foreground">
              Designer: {values.detailsDesigner}
            </p>
          ) : null}
          {values.detailsCondition ? (
            <p className="line-clamp-1 text-xs text-muted-foreground">
              Condition: {values.detailsCondition}
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            {originalPriceLabel ? (
              <p className="line-through text-xs text-muted-foreground">{originalPriceLabel}</p>
            ) : null}
            <p className="text-sm font-medium text-primary">{priceLabel}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
