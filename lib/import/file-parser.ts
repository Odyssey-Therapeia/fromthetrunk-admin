export type ParsedFile = {
  headers: string[];
  rows: Record<string, string>[];
};

/** Detect file type from filename extension. */
export function detectFileType(filename: string): "csv" | "xlsx" | "unknown" {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "csv") return "csv";
  if (ext === "xlsx" || ext === "xls") return "xlsx";
  return "unknown";
}

/**
 * Parse a CSV string into headers and rows using an RFC 4180-compliant
 * state machine. Supports quoted fields, escaped double-quotes ("") within
 * quoted fields, and multi-line values. Accepts both LF and CRLF endings.
 */
export function parseCSV(text: string): ParsedFile {
  const records = parseCsvRecords(text);
  if (records.length === 0) return { headers: [], rows: [] };

  const headers = records[0].map((h) => h.trim());
  if (headers.length === 0) return { headers: [], rows: [] };

  const rows = records.slice(1).map((values) => {
    const row: Record<string, string> = {};
    headers.forEach((header, i) => {
      row[header] = (values[i] ?? "").trim();
    });
    return row;
  });

  return { headers, rows };
}

/**
 * Stream-parse CSV text into rows of string cells.
 * Handles quoted fields, "" escapes, and multi-line values per RFC 4180.
 */
function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let rowNonEmpty = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        // Escaped quote "" inside a quoted field emits a single quote.
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      rowNonEmpty = true;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      // Consume paired \r\n as one line break.
      if (ch === "\r" && text[i + 1] === "\n") i++;
      if (rowNonEmpty || field.length > 0) {
        row.push(field);
        records.push(row);
        row = [];
        field = "";
        rowNonEmpty = false;
      }
      continue;
    }
    field += ch;
  }

  // Flush the final field/row if the input didn't end with a newline.
  if (rowNonEmpty || field.length > 0 || inQuotes) {
    row.push(field);
    records.push(row);
  }

  return records.filter((r) => r.some((cell) => cell.length > 0));
}
