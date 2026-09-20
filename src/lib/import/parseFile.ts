/**
 * File parsing for the import pipeline.
 *
 * Accepts an uploaded file buffer + filename and returns the raw row objects
 * plus the detected header columns. CSV is parsed with papaparse; XLSX/XLS with
 * SheetJS (xlsx).
 *
 * Security note (FEAT-001): xlsx/SheetJS carries a prototype-pollution advisory.
 * We therefore rebuild every parsed row as a fresh plain object and drop the
 * dangerous keys __proto__/constructor/prototype, so nothing from the workbook
 * can pollute Object.prototype downstream.
 */

import Papa from "papaparse";
import * as XLSX from "xlsx";

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export interface ParsedFile {
  rows: Record<string, unknown>[];
  headers: string[];
}

export type SupportedFormat = "csv" | "xlsx";

/** Decide the format from the filename extension. */
export function detectFormat(filename: string): SupportedFormat {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".tsv") || lower.endsWith(".txt")) {
    return "csv";
  }
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls") || lower.endsWith(".xlsm")) {
    return "xlsx";
  }
  // Default to CSV — most scraper exports are CSV.
  return "csv";
}

/** Rebuild a row as a plain object, dropping prototype-polluting keys. */
function sanitizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (DANGEROUS_KEYS.has(k)) continue;
    out[k] = v;
  }
  return out;
}

/** Collect the union of all keys seen across the parsed rows, preserving order. */
function collectHeaders(
  rows: Record<string, unknown>[],
  preferred?: string[]
): string[] {
  const seen = new Set<string>();
  const headers: string[] = [];
  if (preferred) {
    for (const h of preferred) {
      if (!seen.has(h)) {
        seen.add(h);
        headers.push(h);
      }
    }
  }
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        headers.push(key);
      }
    }
  }
  return headers;
}

function parseCsv(buffer: Buffer): ParsedFile {
  const text = buffer.toString("utf-8");
  const result = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
  });

  const rows = (result.data ?? [])
    .filter((r) => r && typeof r === "object")
    .map((r) => sanitizeRow(r as Record<string, unknown>));

  const preferred = (result.meta?.fields ?? []).filter(
    (f): f is string => typeof f === "string" && !DANGEROUS_KEYS.has(f)
  );

  return { rows, headers: collectHeaders(rows, preferred) };
}

function parseXlsx(buffer: Buffer): ParsedFile {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return { rows: [], headers: [] };
  }
  const sheet = workbook.Sheets[firstSheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });
  const rows = json
    .filter((r) => r && typeof r === "object")
    .map((r) => sanitizeRow(r));
  return { rows, headers: collectHeaders(rows) };
}

/**
 * Parse an uploaded file into raw rows + detected headers.
 * @param buffer   The file contents.
 * @param filename Used to detect CSV vs XLSX.
 */
export function parseFile(buffer: Buffer, filename: string): ParsedFile {
  const format = detectFormat(filename);
  return format === "xlsx" ? parseXlsx(buffer) : parseCsv(buffer);
}
