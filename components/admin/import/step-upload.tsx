"use client";

import { useCallback, useRef, useState } from "react";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useImportStore } from "@/lib/store/import-store";
import { useImportWizard } from "./import-hooks";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

function validateFile(file: File): string | null {
  const isCsvMime =
    file.type === "text/csv" ||
    file.type === "application/vnd.ms-excel" ||
    file.type === "application/csv" ||
    file.type === "";
  const isCsvName = file.name.toLowerCase().endsWith(".csv");
  if (!isCsvMime || !isCsvName) return "Only .csv files are supported.";
  if (file.size > MAX_UPLOAD_BYTES) {
    return `File is too large (max ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB).`;
  }
  return null;
}

export function StepUpload() {
  const { file, isProcessing } = useImportStore();
  const { uploadAndParse } = useImportWizard();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(
    (selectedFile: File) => {
      const err = validateFile(selectedFile);
      if (err) {
        toast.error(err);
        return;
      }
      void uploadAndParse(selectedFile);
    },
    [uploadAndParse],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) handleFile(droppedFile);
    },
    [handleFile],
  );

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          "flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-12 transition-colors",
          dragOver
            ? "border-primary bg-primary/5"
            : "border-border/70 bg-background/50",
        )}
      >
        <Upload className="h-8 w-8 text-muted-foreground" />
        <div className="text-center">
          <p className="text-sm font-medium">
            Drop your CSV file here, or click to browse
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Supports CSV files. XLSX support coming soon.
          </p>
        </div>
        <Button
          onClick={() => inputRef.current?.click()}
          disabled={isProcessing}
          variant="outline"
          className="rounded-full"
        >
          {isProcessing ? "Parsing..." : "Choose File"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const selected = e.target.files?.[0];
            if (selected) handleFile(selected);
          }}
        />
      </div>

      {file && (
        <div className="rounded-xl border border-border/70 bg-card/85 p-4">
          <p className="text-sm font-medium">{file.name}</p>
          <p className="text-xs text-muted-foreground">
            {(file.size / 1024).toFixed(1)} KB
          </p>
        </div>
      )}
    </div>
  );
}
