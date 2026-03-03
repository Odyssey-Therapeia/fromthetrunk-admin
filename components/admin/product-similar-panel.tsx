"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR } from "@/db/money";

type Recommendation = {
  product: {
    id: string;
    name: string;
    pricePaise: number;
    slug: string;
    stockStatus: string;
  };
  reason: string;
  score: number;
  source: "heuristic" | "semantic";
};

type ProductSimilarPanelProps = {
  productId: string;
};

export function ProductSimilarPanel({
  productId,
}: ProductSimilarPanelProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [items, setItems] = useState<Recommendation[]>([]);

  const loadRecommendations = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/v2/products/${productId}/recommendations?limit=6`
      );
      if (!response.ok) {
        setItems([]);
        return;
      }

      const payload = (await response.json()) as {
        recommendations?: Recommendation[];
      };
      setItems(payload.recommendations ?? []);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Find Similar</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          onClick={loadRecommendations}
          size="sm"
          type="button"
          variant="outline"
        >
          {isLoading ? "Finding..." : "Find similar products"}
        </Button>

        {items.length > 0 ? (
          <div className="space-y-2 text-sm">
            {items.map((entry) => (
              <div
                className="rounded-md border border-border/60 bg-card p-3"
                key={entry.product.id}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1">
                    <p className="font-medium">{entry.product.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {entry.reason} • {entry.source} • score {entry.score.toFixed(3)}
                    </p>
                  </div>
                  <p className="text-xs font-medium text-muted-foreground">
                    {formatINR(entry.product.pricePaise)}
                  </p>
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs">
                  <span className="uppercase tracking-[0.2em] text-muted-foreground">
                    {entry.product.stockStatus}
                  </span>
                  <Link
                    className="text-primary underline underline-offset-4"
                    href={`/admin/products/${entry.product.id}`}
                  >
                    Open
                  </Link>
                  <Link
                    className="text-muted-foreground underline underline-offset-4"
                    href={`/collection/${entry.product.slug}`}
                    target="_blank"
                  >
                    Preview
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
