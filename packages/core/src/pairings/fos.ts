import { Pairing, type ImportError } from "@holdline/types";
import type { ParsedPairings } from "./file.js";

/**
 * The FOS bid package listing, as Envoy publishes it (DOC_FLT_PBS_<year>_<mon>_<base>_<seat>.pdf).
 * Text comes from the API's PDF reader; this file only parses text, so core stays pure.
 *
 * One pairing block, from an ORD October 2026 package:
 *
 *     14011 BASE REPT: 1630L Mo Tu We Th Fr Sa Su
 *     Base : ORD (CA01FO01) -- -- -- -- --
 *     -- -- -- -- -- -- --
 *     -- -- 30
 *     WE DH 489 ORD-DCA 1700 2006 206 203 AA
 *     WE 3441 DCA-CMH 2209 2336 127 E7M 127 206 333 621 1522
 *     D-END: 2351L REPT: 1513L FDP: 0606 FDPLim: 1200
 *     Marriott Columbus Airport 614--475-7551
 *     ...
 *     TOTALS BLK 1259 DHD 206 TRIP RIG: 0 CDT 1505 T.A.F.B. 5119 LDGS: 6
 *
 * The calendar grid under the header holds the days of the month the pairing operates, laid out
 * Monday to Sunday, with `--` for a day it doesn't. Each of those days becomes one Pairing, since
 * that's what a crew member bids on. Columns: DAY DH FLTN DPS-ARS DEPL ARRL BLKT GRNT EQP.
 */

const BLOCK = /^=+\s*$/m;
/** Page banner, e.g. "E7M PILOT CARRY-IN PAIRINGS SEP 28 - SEP 30, 2026 - ORD". */
const BANNER = /^.*\bPAIRINGS\b.*\d{4}\s*-\s*[A-Z]{3}\s*$/gm;
const HEADER = /^\s*([0-9A-Z]{4,6})\s+BASE REPT:\s*(\d{3,4})L/m;
const LEG =
  /^\s*(\d{1,2}|[A-Z]{2})\s+(DH\s+)?(\d{2,4})\s+([A-Z]{3})-([A-Z]{3})\s+(\d{3,4})\s+(\d{3,4})\b/;
const DUTY_END = /D-END:\s*(\d{3,4})L/;
const TOTALS =
  /TOTALS\s+BLK\s+(\d+)\s+DHD\s+(\d+)\s+TRIP RIG:\s*(\d+)\s+CDT\s+(\d+)\s+T\.A\.F\.B\.\s+(\d+)\s+LDGS:\s*(\d+)/;
/** One calendar cell: a day of the month, or -- for a day the pairing doesn't operate. */
const CELL = /^(?:--|[1-9]|[12]\d|3[01])$/;
/**
 * Extracting the PDF flattens the two printed columns, so the tail of the calendar grid often
 * lands at the end of the first leg line ("WE 3600 ORD-YUL 0813 1144 231 47 E7M -- -- 30").
 * Nothing else at the end of a leg line is that small: the credit and duty columns are 3-4 digits.
 */
const TRAILING_CELLS = /(?:^|\s)((?:--|[1-9]|[12]\d|3[01])(?:\s+(?:--|[1-9]|[12]\d|3[01]))*)\s*$/;

/** "1630" -> "16:30". */
const clock = (hhmm: string): string => {
  const padded = hhmm.padStart(4, "0");
  return `${padded.slice(0, 2)}:${padded.slice(2)}`;
};

/** FOS writes durations without a separator: "953" is 9:53, "5119" is 51:19. */
const minutes = (value: string): number => {
  const padded = value.padStart(3, "0");
  return Number(padded.slice(0, -2)) * 60 + Number(padded.slice(-2));
};

const addDays = (isoDate: string, days: number): string => {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

interface RawLeg {
  day: string;
  deadhead: boolean;
  flight: string;
  from: string;
  to: string;
  departs: string;
  arrives: string;
  duty: number;
}

/** Days of the month the block's calendar grid marks as operating. */
function operatingDays(block: string): number[] {
  const days = new Set<number>();
  for (const line of block.split("\n")) {
    // The grid sits above the flying; once a duty has ended there's only hotels and totals left.
    if (DUTY_END.test(line)) break;
    const cells = LEG.test(line) ? (TRAILING_CELLS.exec(line)?.[1] ?? "") : line;
    for (const token of cells.split(/\s+/)) {
      if (CELL.test(token) && token !== "--") days.add(Number(token));
    }
  }
  return [...days].sort((a, b) => a - b);
}

/** Every duty's last arrival station except the final duty's. */
function layoversOf(legs: RawLeg[]): string[] {
  const lastOfDuty = new Map<number, string>();
  for (const leg of legs) lastOfDuty.set(leg.duty, leg.to);
  const duties = [...lastOfDuty.keys()].sort((a, b) => a - b);
  return duties.slice(0, -1).map((d) => lastOfDuty.get(d)!);
}

/** What the package's first page publishes about the bid period. */
export interface FosSummary {
  /** Lines the airline is building for this base and seat. */
  pairingLines?: number;
  reserveLines?: number;
  /** Minutes; the windows a NAVBLUE Set Condition Credit Window line can ask for. */
  creditWindows?: {
    normal: { min: number; max: number };
    minimum?: { min: number; max: number };
    maximum?: { min: number; max: number };
  };
}

/** "70:01 – 80:01" (en dash or hyphen) -> minutes. */
function window(text: string, label: string): { min: number; max: number } | undefined {
  const m = new RegExp(`${label}\\s+(\\d{1,3}):(\\d\\d)\\s*[–-]\\s*(\\d{1,3}):(\\d\\d)`).exec(text);
  if (!m) return undefined;
  return {
    min: Number(m[1]) * 60 + Number(m[2]),
    max: Number(m[3]) * 60 + Number(m[4]),
  };
}

export function parseFosSummary(text: string): FosSummary {
  const count = (label: string) => {
    const m = new RegExp(`${label}\\s+(\\d{1,5})\\b`).exec(text);
    return m ? Number(m[1]) : undefined;
  };
  const normal = window(text, "Normal Credit Window");
  return {
    pairingLines: count("Total Pairing Lines Target"),
    reserveLines: count("Total RSV Lines Target"),
    creditWindows: normal
      ? {
          normal,
          minimum: window(text, "Minimum Credit Window"),
          maximum: window(text, "Maximum Credit Window"),
        }
      : undefined,
  };
}

/**
 * @param month the bid month as YYYY-MM. Blocks whose header says they're carry-in pairings from
 * the previous month are skipped: they start before the bid period.
 */
export function parseFosText(
  text: string,
  month: string,
): ParsedPairings & { summary: FosSummary } {
  const pairings: Pairing[] = [];
  const errors: ImportError[] = [];
  const blocks = text.split(BLOCK);
  let carryIn = 0;
  let inCarryIn = false;

  for (const [index, block] of blocks.entries()) {
    const header = HEADER.exec(block);
    // A page banner names the section the pairings after it belong to, and the package opens with
    // the previous month's carry-in trips. They start before this bid period, so they're skipped.
    const banners = [...block.slice(0, header?.index ?? block.length).matchAll(BANNER)];
    const banner = banners.at(-1);
    if (banner) inCarryIn = /CARRY-IN/i.test(banner[0]);
    if (!header) continue;
    if (inCarryIn) {
      carryIn++;
      continue;
    }
    const [, number, report] = header as unknown as [string, string, string];
    const totals = TOTALS.exec(block);
    if (!totals) {
      errors.push({ line: index, message: `Pairing ${number}: no TOTALS line` });
      continue;
    }

    const legs: RawLeg[] = [];
    let duty = 1;
    let release: string | undefined;
    for (const line of block.split("\n")) {
      const leg = LEG.exec(line);
      if (leg) {
        const [, day, dh, flight, from, to, departs, arrives] = leg as unknown as string[];
        legs.push({
          day: day!,
          deadhead: dh !== undefined,
          flight: flight!,
          from: from!,
          to: to!,
          departs: departs!,
          arrives: arrives!,
          duty,
        });
        continue;
      }
      const end = DUTY_END.exec(line);
      if (end) {
        release = clock(end[1]!);
        duty++;
      }
    }
    if (!legs.length) {
      errors.push({ line: index, message: `Pairing ${number}: no flight legs` });
      continue;
    }

    // The DAY column is a day index (1, 2) or a weekday (MO, TU); either way it changes on a new day.
    let dayIndex = 1;
    const dayOf = legs.map((leg, i) => {
      if (i > 0 && leg.day !== legs[i - 1]!.day) dayIndex++;
      return dayIndex;
    });
    // Pairing.days caps at 10; nothing in a regional package comes close.
    const days = Math.min(dayIndex, 10);

    const dates = operatingDays(block);
    if (!dates.length) {
      errors.push({
        line: index,
        message: `Pairing ${number}: no operating dates in the calendar`,
      });
      continue;
    }

    for (const dayOfMonth of dates) {
      const startDate = `${month}-${String(dayOfMonth).padStart(2, "0")}`;
      const parsed = Pairing.safeParse({
        number,
        startDate,
        days,
        creditMinutes: minutes(totals[4]!),
        tafbMinutes: minutes(totals[5]!),
        report: clock(report),
        release,
        layovers: layoversOf(legs),
        legs: legs.map((leg, i) => {
          const date = addDays(startDate, dayOf[i]! - 1);
          const overnight = Number(leg.arrives) < Number(leg.departs);
          return {
            duty: leg.duty,
            flight: leg.flight,
            from: leg.from,
            to: leg.to,
            departs: `${date}T${clock(leg.departs)}`,
            arrives: `${overnight ? addDays(date, 1) : date}T${clock(leg.arrives)}`,
            deadhead: leg.deadhead,
          };
        }),
      });
      if (parsed.success) pairings.push(parsed.data);
      else errors.push({ line: index, message: `Pairing ${number} on ${startDate}: invalid` });
    }
  }

  if (!pairings.length && !errors.length) {
    errors.push({ line: 0, message: "No pairing blocks found. Is this a FOS bid package?" });
  }
  if (carryIn) {
    errors.push({
      line: 0,
      message: `Skipped ${carryIn} carry-in pairing${carryIn === 1 ? "" : "s"} from the previous month.`,
    });
  }
  return { pairings, errors, summary: parseFosSummary(text) };
}
