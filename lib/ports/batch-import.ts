export type FieldMapping = {
  csvColumn: string;
  dbField: string;
  confidence: number;
  status: "mapped" | "unmapped" | "skipped";
};

export type ValidationError = {
  row: number;
  field: string;
  value: string;
  message: string;
  severity: "error" | "warning";
};

export type ImportPreviewRow = {
  rowIndex: number;
  data: Record<string, string>;
  errors: ValidationError[];
  status: "valid" | "warning" | "error";
};

export type ImportResult = {
  total: number;
  created: number;
  failed: number;
  errors: Array<{ row: number; message: string }>;
};

/** Port for batch import operations. */
export interface BatchImportPort {
  parseFile(file: File): Promise<{
    headers: string[];
    previewRows: Record<string, string>[];
    totalRows: number;
    fileId: string;
  }>;

  suggestMappings(headers: string[]): Promise<FieldMapping[]>;

  validateRows(params: {
    fileId: string;
    mappings: FieldMapping[];
  }): Promise<ImportPreviewRow[]>;

  executeImport(params: {
    fileId: string;
    mappings: FieldMapping[];
  }): Promise<ImportResult>;
}
