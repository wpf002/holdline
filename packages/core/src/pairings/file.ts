import { Pairing, type ImportError, type PairingFormat } from "@holdline/types";
import { readCsv } from "./csv.js";

/**
 * Pairing files -> Holdline pairings. Each format gets a reader; airline exports (NAVBLUE, Sabre
 * bid packets) get their own once a real sample is in data/private/. See docs/pairing-import.md.
 */

export interface ParsedPairings {
  pairings: Pairing[];
  errors: ImportError[];
}

const CSV_COLUMNS = [
  "pairing",
  "start_date",
  "days",
  "credit",
  "tafb",
  "report",
  "release",
  "layovers",
];
const REQUIRED = ["pairing", "start_date", "days", "credit"];

/** "16:42" or "016:42" -> 1002 minutes; undefined when blank, NaN when malformed. */
export function duration(value: string | undefined): number | undefined {
  const v = value?.trim();
  if (!v) return undefined;
  const m = /^(\d{1,3}):([0-5]\d)$/.exec(v);
  if (!m) return Number.NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Layover stations: every duty's last arrival except the final duty's. */
function layoversFromLegs(p: Pairing): string[] {
  const lastLegOfDuty = new Map<number, string>();
  for (const leg of p.legs) lastLegOfDuty.set(leg.duty, leg.to);
  const duties = [...lastLegOfDuty.keys()].sort((a, b) => a - b);
  return duties.slice(0, -1).map((d) => lastLegOfDuty.get(d)!);
}

export function describeIssues(issues: { path: PropertyKey[]; message: string }[]): string {
  return issues
    .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
    .join("; ");
}

function readHoldlineCsv(text: string): ParsedPairings {
  const [header, ...rows] = readCsv(text.replace(/^\uFEFF/, ""));
  const columns = (header ?? []).map((h) => h.trim().toLowerCase());
  const missing = REQUIRED.filter((c) => !columns.includes(c));
  if (missing.length) {
    return {
      pairings: [],
      errors: [
        {
          line: 1,
          message: `Missing column(s): ${missing.join(", ")}. Expected ${CSV_COLUMNS.join(",")}.`,
        },
      ],
    };
  }
  const col = (row: string[], name: string) => {
    const i = columns.indexOf(name);
    return i === -1 ? undefined : row[i]?.trim();
  };

  const pairings: Pairing[] = [];
  const errors: ImportError[] = [];
  rows.forEach((row, i) => {
    const line = i + 2;
    if (row.every((cell) => cell.trim() === "")) return;
    const layovers = col(row, "layovers");
    const parsed = Pairing.safeParse({
      number: col(row, "pairing"),
      startDate: col(row, "start_date"),
      days: Number(col(row, "days")),
      creditMinutes: duration(col(row, "credit")),
      tafbMinutes: duration(col(row, "tafb")),
      report: col(row, "report") || undefined,
      release: col(row, "release") || undefined,
      layovers: layovers ? layovers.split(/[\s;|]+/).filter(Boolean) : [],
    });
    if (parsed.success) pairings.push(parsed.data);
    else errors.push({ line, message: describeIssues(parsed.error.issues) });
  });
  return { pairings, errors };
}

function readHoldlineJson(text: string): ParsedPairings {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    return {
      pairings: [],
      errors: [{ line: 1, message: `Not valid JSON: ${(err as Error).message}` }],
    };
  }
  const items = Array.isArray(data) ? data : (data as { pairings?: unknown })?.pairings;
  if (!Array.isArray(items)) {
    return {
      pairings: [],
      errors: [{ line: 1, message: 'Expected an array of pairings or {"pairings": [...]}.' }],
    };
  }
  const pairings: Pairing[] = [];
  const errors: ImportError[] = [];
  items.forEach((item, i) => {
    const parsed = Pairing.safeParse(item);
    // For JSON, "line" is the pairing's position in the array, starting at 1.
    if (parsed.success) pairings.push(parsed.data);
    else errors.push({ line: i + 1, message: describeIssues(parsed.error.issues) });
  });
  return { pairings, errors };
}

const READERS: Record<PairingFormat, (text: string) => ParsedPairings> = {
  "holdline-csv": readHoldlineCsv,
  "holdline-json": readHoldlineJson,
};

/** Parses, fills layovers from legs when the file only has legs, and drops duplicate pairings. */
export function parsePairingFile(format: PairingFormat, text: string): ParsedPairings {
  const { pairings, errors } = READERS[format](text);
  const seen = new Set<string>();
  const unique: Pairing[] = [];
  for (const p of pairings) {
    const key = `${p.number}@${p.startDate}`;
    if (seen.has(key)) {
      errors.push({
        line: 0,
        message: `Pairing ${p.number} on ${p.startDate} appears more than once; kept the first.`,
      });
      continue;
    }
    seen.add(key);
    unique.push(p.layovers.length || !p.legs.length ? p : { ...p, layovers: layoversFromLegs(p) });
  }
  return { pairings: unique, errors };
}
