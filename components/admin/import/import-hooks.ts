"use client";

import { useCallback } from "react";
import { toast } from "sonner";

import { batchImportAdapter } from "@/lib/adapters/batch-import-rest";
import { useImportStore } from "@/lib/store/import-store";

export function useImportWizard() {
  const store = useImportStore();

  const uploadAndParse = useCallback(
    async (file: File) => {
      // Reset any stale state from a previous run so partial data from a
      // failed parse can't bleed into the new upload.
      store.reset();
      store.setProcessing(true);
      store.setFile(file);
      try {
        const result = await batchImportAdapter.parseFile(file);
        store.setParseResult(result);

        // Auto-suggest mappings
        const mappings = await batchImportAdapter.suggestMappings(result.headers);
        store.setMappings(mappings);
        store.setStep("map");

        toast.success(`Parsed ${result.totalRows} rows`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to parse file");
      } finally {
        store.setProcessing(false);
      }
    },
    [store],
  );

  const validate = useCallback(async () => {
    if (!store.fileId) return;
    store.setProcessing(true);
    try {
      const results = await batchImportAdapter.validateRows({
        fileId: store.fileId,
        mappings: store.mappings,
      });
      store.setValidationResults(results);
      store.setStep("validate");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Validation failed");
    } finally {
      store.setProcessing(false);
    }
  }, [store]);

  const executeImport = useCallback(async () => {
    if (!store.fileId) return;
    store.setProcessing(true);
    try {
      const result = await batchImportAdapter.executeImport({
        fileId: store.fileId,
        mappings: store.mappings,
      });
      store.setImportResult(result);
      toast.success(`Imported ${result.created} products`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      store.setProcessing(false);
    }
  }, [store]);

  return { uploadAndParse, validate, executeImport };
}
