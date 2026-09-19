import type { BidIntent, Weekday } from "@holdline/types";
import { datesBetween, monthBounds, monthName, shortDate } from "./format.js";

/** A BidIntent's days off, clipped to the bid month. Shared by every compiler. */
export interface DaysOffInMonth {
  /** Specific dates inside the month, most important first. */
  dates: string[];
  /** Blocks trimmed to the month. */
  ranges: { start: string; end: string }[];
  /** Days of the week, most important first. */
  daysOfWeek: Weekday[];
  weekends: boolean;
}

/** Drops dates outside the bid month and trims blocks that cross it, warning for each. */
export function daysOffInMonth(intent: BidIntent, warn: (message: string) => void): DaysOffInMonth {
  const { first, last } = monthBounds(intent.month);
  const period = monthName(intent.month);
  const list = [...new Set(intent.daysOff.dates)];
  const outside = list.filter((d) => d < first || d > last);
  if (outside.length) {
    warn(
      `Skipped days off outside the ${period} bid period: ${outside.map(shortDate).join(", ")}.`,
    );
  }

  const ranges: DaysOffInMonth["ranges"] = [];
  for (const r of intent.daysOff.ranges) {
    const start = r.start < first ? first : r.start;
    const end = r.end > last ? last : r.end;
    const asked = `${shortDate(r.start)} - ${shortDate(r.end)}`;
    if (start > end) {
      warn(`Skipped days off ${asked}: outside the ${period} bid period.`);
      continue;
    }
    if (start !== r.start || end !== r.end)
      warn(`Trimmed days off ${asked} to the ${period} bid period.`);
    ranges.push({ start, end });
  }

  return {
    dates: list.filter((d) => d >= first && d <= last),
    ranges,
    daysOfWeek: [...new Set(intent.daysOff.daysOfWeek)],
    weekends: intent.daysOff.weekends,
  };
}

const WEEKDAYS: Weekday[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** Every date in the month the request covers, sorted; days of the week and weekends become dates. */
export function allDaysOff(off: DaysOffInMonth, month: string): string[] {
  const { first, last } = monthBounds(month);
  const days = new Set([...off.dates, ...off.ranges.flatMap((r) => datesBetween(r.start, r.end))]);
  for (const iso of datesBetween(first, last)) {
    const weekday = WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()]!;
    if (off.daysOfWeek.includes(weekday)) days.add(iso);
    if (off.weekends && (weekday === "SAT" || weekday === "SUN")) days.add(iso);
  }
  return [...days].sort();
}

/** Sorted dates -> runs of consecutive dates. */
export function toRuns(sorted: string[]): { start: string; end: string }[] {
  const runs: { start: string; end: string }[] = [];
  for (const iso of sorted) {
    const current = runs.at(-1);
    const next = current && datesBetween(current.end, iso).length === 2;
    if (current && next) current.end = iso;
    else runs.push({ start: iso, end: iso });
  }
  return runs;
}
