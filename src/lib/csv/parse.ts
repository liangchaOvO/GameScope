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
  // physicalRow = 1-based row number in the file (counting blank lines),
  // so error messages stay accurate even when blank rows are skipped.
  const physical = allRows.map((cells, i) => ({
    cells: (cells ?? []).map((c) => (c ?? "").trim()),
    physicalRow: i + 1,
  }));
  const nonEmpty = physical.filter((r) =>
    r.cells.some((c) => c !== "")
  );
  if (nonEmpty.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = nonEmpty[0].cells;
  const rows = nonEmpty.slice(1).map((r) => ({
    rowNo: r.physicalRow,
    cells: r.cells,
  }));

  return { headers, rows };
}
