import type {
  BatchImportPort,
  FieldMapping,
  ImportPreviewRow,
  ImportResult,
} from "@/lib/ports/batch-import";

/** Error thrown by the import adapter that preserves server-side status + payload. */
export class ImportAdapterError extends Error {
  status: number;
  code?: string;
  body: unknown;
  constructor(
    message: string,
    opts: { status: number; code?: string; body?: unknown },
  ) {
    super(message);
    this.name = "ImportAdapterError";
    this.status = opts.status;
    this.code = opts.code;
    this.body = opts.body;
  }
}

async function parseServerError(res: Response, fallback: string): Promise<ImportAdapterError> {
  let body: unknown = undefined;
  try {
    body = await res.json();
  } catch {
    try {
      body = await res.text();
    } catch {
      // ignore
    }
  }
  const code =
    body && typeof body === "object" && "code" in body
      ? String((body as { code: unknown }).code)
      : undefined;
  const serverMessage =
    body && typeof body === "object" && "error" in body
      ? String((body as { error: unknown }).error)
      : undefined;
  return new ImportAdapterError(
    `${fallback} (${res.status} ${res.statusText})${serverMessage ? `: ${serverMessage}` : ""}`,
    { status: res.status, code, body },
  );
}

class BatchImportRestAdapter implements BatchImportPort {
  async parseFile(file: File) {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/v2/admin/import/parse", {
      method: "POST",
      body: formData,
    });
    if (!res.ok) throw await parseServerError(res, "Failed to parse file");
    return res.json();
  }

  async suggestMappings(headers: string[]): Promise<FieldMapping[]> {
    const res = await fetch("/api/v2/admin/import/map", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ headers }),
    });
    if (!res.ok) throw await parseServerError(res, "Failed to suggest mappings");
    const data = await res.json();
    return data.mappings;
  }

  async validateRows(params: {
    fileId: string;
    mappings: FieldMapping[];
  }): Promise<ImportPreviewRow[]> {
    const res = await fetch("/api/v2/admin/import/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw await parseServerError(res, "Failed to validate rows");
    const data = await res.json();
    return data.rows;
  }

  async executeImport(params: {
    fileId: string;
    mappings: FieldMapping[];
  }): Promise<ImportResult> {
    const res = await fetch("/api/v2/admin/import/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw await parseServerError(res, "Failed to execute import");
    return res.json();
  }
}

export const batchImportAdapter = new BatchImportRestAdapter();
