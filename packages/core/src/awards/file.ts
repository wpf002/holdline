import { Award, type AwardFormat, type ImportError } from "@holdline/types";
import { readCsv } from "../pairings/csv.js";
import { describeIssues, duration } from "../pairings/file.js";

/**
 * Award results -> Holdline awards. Only seniority and what was awarded are read; every other
 * column (names, employee numbers) is ignored and never stored. See docs/award-import.md.
 */

export interface ParsedAwards {
  awards: Award[];
  errors: ImportError[];
}

const COLUMNS = ["seniority", "pairing", "start_date", "line_credit", "reserve"];

function flag(value: string | undefined): boolean | undefined {
  const v = value?.trim().toLowerCase();
  if (!v) return undefined;
  if (["y", "yes", "true", "1", "r", "rsv", "reserve"].includes(v)) return true;
  if (["n", "no", "false", "0", "l", "line"].includes(v)) return false;
  return undefined;
}

function readAwardsCsv(text: string): ParsedAwards {
  const [header, ...rows] = readCsv(text.replace(/^\uFEFF/, ""));
  const columns = (header ?? []).map((h) => h.trim().toLowerCase());
  if (!columns.includes("seniority")) {
    return {
      awards: [],
      errors: [{ line: 1, message: `Missing column: seniority. Expected ${COLUMNS.join(",")}.` }],
    };
  }
  const col = (row: string[], name: string) => {
    const i = columns.indexOf(name);
    return i === -1 ? undefined : row[i]?.trim() || undefined;
  };

  const awards: Award[] = [];
  const errors: ImportError[] = [];
  rows.forEach((row, i) => {
    const line = i + 2;
    if (row.every((cell) => cell.trim() === "")) return;
    const pairingNumber = col(row, "pairing");
    const pairingDate = col(row, "start_date");
    const reserve = flag(col(row, "reserve"));
    const lineCreditMinutes = duration(col(row, "line_credit"));
    if (pairingNumber && !pairingDate) {
      errors.push({
        line,
        message: "pairing needs a start_date: pairing numbers repeat across dates.",
      });
      return;
    }
    if (!pairingNumber && lineCreditMinutes === undefined && reserve === undefined) {
      errors.push({
        line,
        message: "Nothing awarded on this row: add pairing, line_credit or reserve.",
      });
      return;
    }
    const parsed = Award.safeParse({
      seniority: Number(col(row, "seniority")),
      pairingNumber,
      pairingDate,
      lineCreditMinutes,
      reserve: reserve ?? false,
    });
    if (parsed.success) awards.push(parsed.data);
    else errors.push({ line, message: describeIssues(parsed.error.issues) });
  });
  return { awards, errors };
}

const READERS: Record<AwardFormat, (text: string) => ParsedAwards> = {
  "holdline-awards-csv": readAwardsCsv,
};

export function parseAwardFile(format: AwardFormat, text: string): ParsedAwards {
  return READERS[format](text);
}
