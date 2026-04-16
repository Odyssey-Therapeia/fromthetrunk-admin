"use client";

import { AlertTriangle, Check, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useImportStore } from "@/lib/store/import-store";
import { useImportWizard } from "./import-hooks";
import { cn } from "@/lib/utils";

export function StepValidate() {
  const { validationResults, isProcessing, importResult } = useImportStore();
  const { executeImport } = useImportWizard();

  // Single-pass counting; equivalent to three filters but cheaper for large imports.
  const { validCount, warningCount, errorCount } = validationResults.reduce(
    (acc, r) => {
      if (r.status === "valid") acc.validCount++;
      else if (r.status === "warning") acc.warningCount++;
      else if (r.status === "error") acc.errorCount++;
      return acc;
    },
    { validCount: 0, warningCount: 0, errorCount: 0 },
  );
  const importableCount = validCount + warningCount;

  if (importResult) {
    return (
      <Card className="border-border/70 bg-card/85">
        <CardHeader>
          <CardTitle>Import Complete</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4 text-center sm:grid-cols-3">
            <div>
              <p className="text-2xl font-semibold">{importResult.total}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-green-600">{importResult.created}</p>
              <p className="text-xs text-muted-foreground">Created</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-red-600">{importResult.failed}</p>
              <p className="text-xs text-muted-foreground">Failed</p>
            </div>
          </div>
          {importResult.errors.length > 0 && (
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {importResult.errors.map((err) => (
                <p key={`err-${err.row}`} className="text-xs text-red-600">
                  Row {err.row + 1}: {err.message}
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-3">
          <Badge variant="outline" className="gap-1 border-green-300 text-green-700">
            <Check className="h-3 w-3" /> {validCount} valid
          </Badge>
          {warningCount > 0 && (
            <Badge variant="outline" className="gap-1 border-amber-300 text-amber-700">
              <AlertTriangle className="h-3 w-3" /> {warningCount} warnings
            </Badge>
          )}
          {errorCount > 0 && (
            <Badge variant="outline" className="gap-1 border-red-300 text-red-700">
              <XCircle className="h-3 w-3" /> {errorCount} errors
            </Badge>
          )}
        </div>
        <Button
          onClick={() => void executeImport()}
          disabled={isProcessing || importableCount === 0}
          className="rounded-full"
        >
          {isProcessing
            ? "Importing..."
            : `Import ${importableCount} Products`}
        </Button>
      </div>

      {validationResults.length > 50 && (
        <p className="text-xs text-muted-foreground">
          Showing the first 50 of {validationResults.length} rows — results
          truncated for display. All rows will still be imported.
        </p>
      )}

      <div className="max-h-[400px] overflow-y-auto rounded-xl border border-border/70">
        {validationResults.slice(0, 50).map((row) => (
          <div
            key={row.rowIndex}
            className={cn(
              "flex items-start gap-3 border-b border-border/50 px-4 py-2 last:border-b-0",
              row.status === "error" && "bg-red-50/50",
              row.status === "warning" && "bg-amber-50/50",
            )}
          >
            <div className="mt-0.5 shrink-0">
              {row.status === "valid" && (
                <Check className="h-4 w-4 text-green-600" />
              )}
              {row.status === "warning" && (
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              )}
              {row.status === "error" && (
                <XCircle className="h-4 w-4 text-red-600" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium">Row {row.rowIndex + 1}</p>
              {row.errors.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {row.errors.map((err, i) => (
                    <li
                      key={`${row.rowIndex}-${err.field}-${i}`}
                      className={cn(
                        "text-xs",
                        err.severity === "error"
                          ? "text-red-600"
                          : "text-amber-600",
                      )}
                    >
                      {err.field}: {err.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
