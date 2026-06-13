"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useImportStore } from "@/lib/store/import-store";
import { DB_FIELDS } from "@/lib/import/field-mapper";
import { useImportWizard } from "./import-hooks";
import { cn } from "@/lib/utils";

export function StepMap() {
  const { mappings, updateMapping, isProcessing, totalRows } =
    useImportStore();
  const { validate } = useImportWizard();

  const mappedCount = mappings.filter((m) => m.status === "mapped").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">
            {mappedCount} of {mappings.length} columns mapped
          </p>
          <p className="text-xs text-muted-foreground">
            {totalRows} rows will be processed
          </p>
        </div>
        <Button
          onClick={() => void validate()}
          disabled={isProcessing || mappedCount === 0}
          className="rounded-full"
        >
          {isProcessing ? "Validating..." : "Validate & Preview"}
        </Button>
      </div>

      <div className="rounded-xl border border-border/70">
        <div className="hidden gap-3 border-b border-border/70 bg-muted/30 px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground sm:grid sm:grid-cols-[1fr_auto_1fr]">
          <span>CSV Column</span>
          <span>Match</span>
          <span>DB Field</span>
        </div>

        {mappings.map((mapping, i) => (
          <div
            key={`${mapping.csvColumn}-${i}`}
            className="grid grid-cols-1 items-center gap-3 border-b border-border/50 px-4 py-2 last:border-b-0 sm:grid-cols-[1fr_auto_1fr]"
          >
            <span className="truncate text-sm">{mapping.csvColumn}</span>
            <Badge
              variant="outline"
              className={cn(
                "text-[10px]",
                mapping.confidence >= 0.8
                  ? "border-green-300 text-green-700"
                  : mapping.confidence >= 0.5
                    ? "border-amber-300 text-amber-700"
                    : "border-border text-muted-foreground",
              )}
            >
              {mapping.confidence > 0
                ? `${Math.round(mapping.confidence * 100)}%`
                : "—"}
            </Badge>
            <Select
              value={mapping.dbField || "__unmapped__"}
              onValueChange={(val) =>
                updateMapping(i, val === "__unmapped__" ? "" : val)
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__unmapped__" className="text-xs text-muted-foreground">
                  Skip
                </SelectItem>
                {DB_FIELDS.map((field) => (
                  <SelectItem key={field} value={field} className="text-xs">
                    {field}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </div>
  );
}
