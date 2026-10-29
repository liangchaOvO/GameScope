import Papa from "papaparse";

export interface ParsedTable {
  /** header cells, trimmed */
  headers: string[];
  /** data rows; rowNo is the 1-based row number in the file (header = row 1) */
  rows: { rowNo: number; cells: string[] }[];
}

/**
 * Parse CSV text into a header + rows table.
 * Empty lines are skipped but row numbering follows the original data-row
 * order (header is row 1, first data row is row 2).
 */
export function parseCsv(text: string): ParsedTable {
  const result = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: false,
  });

  const allRows: string[][] = result.data as string[][];
  const nonEmpty = allRows.filter(
    (cells) => cells && cells.some((c) => c != null && c.trim() !== "")
  );
  if (nonEmpty.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = (nonEmpty[0] ?? []).map((h) => (h ?? "").trim());
  const rows = nonEmpty.slice(1).map((cells, i) => ({
    rowNo: i + 2,
    cells: cells.map((c) => (c ?? "").trim()),
  }));

  return { headers, rows };
}
