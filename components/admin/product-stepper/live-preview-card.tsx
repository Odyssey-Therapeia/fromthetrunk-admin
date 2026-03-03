import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR, toPaise } from "@/db/money";

import type { ProductStepperValues } from "./types";

type LivePreviewCardProps = {
  values: ProductStepperValues;
};

export function LivePreviewCard({
  values,
}: LivePreviewCardProps) {
  const priceLabel = formatINR(toPaise(values.priceRupees || 0));

  return (
    <Card className="sticky top-24">
      <CardHeader>
        <CardTitle className="text-lg">Live Preview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="aspect-[4/5] rounded-md border border-dashed border-muted-foreground/30 bg-muted/30" />
        <div className="space-y-1">
          <p className="line-clamp-1 text-sm font-semibold">
            {values.storyTitle || "Untitled Product"}
          </p>
          <p className="line-clamp-1 text-xs text-muted-foreground">
            {values.detailsFabric || "Fabric details pending"}
          </p>
          <p className="text-sm font-medium text-primary">{priceLabel}</p>
        </div>
      </CardContent>
    </Card>
  );
}
