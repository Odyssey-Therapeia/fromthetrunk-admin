import { create } from "zustand";

import type {
  FieldMapping,
  ImportPreviewRow,
  ImportResult,
} from "@/lib/ports/batch-import";

export type ImportStep = "upload" | "map" | "validate";

export type ImportStoreState = {
  step: ImportStep;
  file: File | null;
  fileId: string | null;
  headers: string[];
  previewRows: Record<string, string>[];
  totalRows: number;
  mappings: FieldMapping[];
  validationResults: ImportPreviewRow[];
  importResult: ImportResult | null;
  isProcessing: boolean;

  setStep: (step: ImportStep) => void;
  setFile: (file: File) => void;
  setParseResult: (result: {
    fileId: string;
    headers: string[];
    previewRows: Record<string, string>[];
    totalRows: number;
  }) => void;
  setMappings: (mappings: FieldMapping[]) => void;
  updateMapping: (index: number, dbField: string) => void;
  setValidationResults: (results: ImportPreviewRow[]) => void;
  setImportResult: (result: ImportResult) => void;
  setProcessing: (processing: boolean) => void;
  reset: () => void;
};

const initialState: Pick<
  ImportStoreState,
  | "step"
  | "file"
  | "fileId"
  | "headers"
  | "previewRows"
  | "totalRows"
  | "mappings"
  | "validationResults"
  | "importResult"
  | "isProcessing"
> = {
  step: "upload",
  file: null,
  fileId: null,
  headers: [],
  previewRows: [],
  totalRows: 0,
  mappings: [],
  validationResults: [],
  importResult: null,
  isProcessing: false,
};

export const useImportStore = create<ImportStoreState>((set) => ({
  ...initialState,

  setStep: (step) => set({ step }),
  setFile: (file) => set({ file }),
  setParseResult: (result) =>
    set({
      fileId: result.fileId,
      headers: result.headers,
      previewRows: result.previewRows,
      totalRows: result.totalRows,
    }),
  setMappings: (mappings) => set({ mappings }),
  updateMapping: (index, dbField) =>
    set((state) => {
      const updated = [...state.mappings];
      if (updated[index]) {
        updated[index] = {
          ...updated[index],
          dbField,
          status: dbField ? "mapped" : "unmapped",
          confidence: dbField ? 1.0 : 0,
        };
      }
      return { mappings: updated };
    }),
  setValidationResults: (results) => set({ validationResults: results }),
  setImportResult: (result) => set({ importResult: result }),
  setProcessing: (isProcessing) => set({ isProcessing }),
  reset: () => set(initialState),
}));
