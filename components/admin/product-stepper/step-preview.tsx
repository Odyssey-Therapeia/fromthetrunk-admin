import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR, toPaise } from "@/db/money";

import { productStockStatusLabels } from "./availability";
import type { ProductStepperValues } from "./types";

type StepPreviewProps = {
  values: ProductStepperValues;
};

export function StepPreview({
  values,
}: StepPreviewProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Final review</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{values.status}</Badge>
          <Badge variant={values.stockStatus === "sold" ? "destructive" : "outline"}>
            {productStockStatusLabels[values.stockStatus]}
          </Badge>
          {values.featured ? <Badge>Featured</Badge> : null}
          <Badge variant="outline">{values.imageMediaIds.length} photos</Badge>
        </div>
        <p>
          <span className="font-medium">Title:</span> {values.storyTitle || "Untitled"}
        </p>
        <p>
          <span className="font-medium">Slug:</span> {values.slug || "not-set"}
        </p>
        <p>
          <span className="font-medium">Fabric:</span> {values.detailsFabric || "not-set"}
        </p>
        <p>
          <span className="font-medium">Price:</span> {formatINR(toPaise(values.priceRupees || 0))}
        </p>
      </CardContent>
    </Card>
  );
}
