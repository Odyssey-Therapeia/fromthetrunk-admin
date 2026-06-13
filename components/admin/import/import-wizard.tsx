"use client";

import { Button } from "@/components/ui/button";
import { useImportStore } from "@/lib/store/import-store";
import { cn } from "@/lib/utils";

import { StepMap } from "./step-map";
import { StepUpload } from "./step-upload";
import { StepValidate } from "./step-validate";

const STEPS = [
  { key: "upload", label: "Upload" },
  { key: "map", label: "Map Fields" },
  { key: "validate", label: "Validate & Import" },
] as const;

export function ImportWizard() {
  const { step, setStep, reset, importResult } = useImportStore();

  return (
    <div className="space-y-6">
      {/* Progress indicator */}
      <ol className="flex items-center gap-2">
        {STEPS.map((s, i) => {
          const isActive = step === s.key;
          const isReachable =
            s.key === "upload" || (s.key === "map" && step !== "upload");
          return (
            <li key={s.key} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (isReachable) setStep(s.key);
                }}
                disabled={!isReachable}
                aria-disabled={!isReachable}
                aria-current={isActive ? "step" : undefined}
                tabIndex={isReachable ? 0 : -1}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                  !isReachable && "opacity-50 cursor-not-allowed",
                )}
              >
                {i + 1}
              </button>
              <span
                className={cn(
                  "text-sm font-medium",
                  isActive ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {s.label}
              </span>
              {i < STEPS.length - 1 && (
                <div className="mx-2 h-px w-8 bg-border" />
              )}
            </li>
          );
        })}
      </ol>

      {/* Step content */}
      {step === "upload" && <StepUpload />}
      {step === "map" && <StepMap />}
      {step === "validate" && <StepValidate />}

      {/* Back / Reset */}
      <div className="flex gap-2">
        {step === "map" && (
          <Button
            onClick={() => setStep("upload")}
            variant="outline"
            className="rounded-full"
          >
            Back
          </Button>
        )}
        {step === "validate" && !importResult && (
          <Button
            onClick={() => setStep("map")}
            variant="outline"
            className="rounded-full"
          >
            Back to Mappings
          </Button>
        )}
        {importResult && (
          <Button onClick={reset} variant="outline" className="rounded-full">
            Import Another File
          </Button>
        )}
      </div>
    </div>
  );
}
