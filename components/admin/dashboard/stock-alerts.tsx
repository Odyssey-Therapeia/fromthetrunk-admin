import { AlertTriangle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type StockAlertsProps = {
  reservedCount: number;
  draftCount: number;
};

export function StockAlerts({ reservedCount, draftCount }: StockAlertsProps) {
  if (reservedCount === 0 && draftCount === 0) return null;

  return (
    <Card className="border-border/70 bg-card/85 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          Alerts
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {reservedCount > 0 && (
          <div className="flex items-center justify-between rounded-lg border border-amber-200/50 bg-amber-50/50 px-3 py-2">
            <span className="text-sm">Reserved products</span>
            <Badge variant="outline" className="border-amber-300 text-amber-700">
              {reservedCount}
            </Badge>
          </div>
        )}
        {draftCount > 0 && (
          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background/70 px-3 py-2">
            <span className="text-sm">Unpublished drafts</span>
            <Badge variant="outline">{draftCount}</Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
