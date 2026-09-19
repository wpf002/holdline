import {
  preferencesInUse,
  type BidContext,
  type BidIntent,
  type PreferenceKey,
  type Weekday,
} from "@holdline/types";

/** Longest trip the form offers; matches BidIntent's cap on pairings.lengthDays.max. */
export const LONGEST_TRIP = 6;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Calendar order for the days-off picker (US bid packets start weeks on Sunday). */
export const WEEK: { key: Weekday; short: string; long: string }[] = [
  { key: "SUN", short: "Sun", long: "Sunday" },
  { key: "MON", short: "Mon", long: "Monday" },
  { key: "TUE", short: "Tue", long: "Tuesday" },
  { key: "WED", short: "Wed", long: "Wednesday" },
  { key: "THU", short: "Thu", long: "Thursday" },
  { key: "FRI", short: "Fri", long: "Friday" },
  { key: "SAT", short: "Sat", long: "Saturday" },
];

export function emptyDraft(context: BidContext): BidIntent {
  return {
    ...context,
    lineType: "LINEHOLDER",
    daysOff: { dates: [], daysOfWeek: [], ranges: [], weekends: false },
    pairings: {
      preferLayovers: [],
      avoidLayovers: [],
      avoidRedeyes: false,
      avoidDeadheads: false,
      specific: [],
    },
    line: { commutable: false },
    waivers: [],
    priorities: [],
  };
}

/** This month and the next two as "YYYY-MM", from the server's clock. */
export function bidMonths(today: Date, count = 3): string[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS_LONG[m! - 1]} ${y}`;
}

/** "2026-10-05" -> "Oct 5" */
export function shortDay(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m! - 1]} ${d}`;
}

export function monthBounds(month: string): { first: string; last: string } {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  return { first: `${month}-01`, last: `${month}-${String(days).padStart(2, "0")}` };
}

/** "Oct 10–12", or "Oct 30–Nov 2" across a month end. */
export function rangeLabel(r: { start: string; end: string }): string {
  const sameMonth = r.start.slice(0, 7) === r.end.slice(0, 7);
  return `${shortDay(r.start)}–${sameMonth ? Number(r.end.slice(8)) : shortDay(r.end)}`;
}

/** Weeks of the bid month, Sunday first; null pads the first and last week. */
export function calendarWeeks(month: string): (string | null)[][] {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  const lead = new Date(Date.UTC(y!, m! - 1, 1)).getUTCDay();
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d++) cells.push(`${month}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

/** Adds the item at the end (lowest priority) or removes it. */
export function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

/** The preferences the form has content for, in the crew member's order; new ones go last. */
export function orderedPriorities(draft: BidIntent): PreferenceKey[] {
  const active = preferencesInUse(draft);
  const ranked = draft.priorities.filter((k, i, all) => active.includes(k) && all.indexOf(k) === i);
  return [...ranked, ...active.filter((k) => !ranked.includes(k))];
}

const hours = (minutes: number) => String(Math.round((minutes / 60) * 100) / 100);

/** One-line summary of a preference for the priority list. */
export function describePreference(draft: BidIntent, key: PreferenceKey): string {
  const { daysOff, pairings, line } = draft;
  const parts: string[] = [];
  switch (key) {
    case "daysOff":
      parts.push(...daysOff.dates.map(shortDay));
      parts.push(...daysOff.ranges.map(rangeLabel));
      if (daysOff.daysOfWeek.length) {
        parts.push(daysOff.daysOfWeek.map((d) => WEEK.find((w) => w.key === d)!.short).join("/"));
      }
      if (daysOff.weekends) parts.push("weekends");
      return parts.join(", ");
    case "pairingLength": {
      const len = pairings.lengthDays;
      if (!len) return "";
      if (len.min === len.max) return `${len.min}-day trips`;
      if (len.min === 1) return `Trips up to ${len.max} days`;
      if (len.max === LONGEST_TRIP) return `Trips of ${len.min} days or more`;
      return `${len.min}–${len.max} day trips`;
    }
    case "reportRelease":
      if (pairings.reportAfter) parts.push(`Report after ${pairings.reportAfter}`);
      if (pairings.releaseBefore) parts.push(`release before ${pairings.releaseBefore}`);
      return parts.join(", ");
    case "layovers":
      if (pairings.avoidLayovers.length) parts.push(`Avoid ${pairings.avoidLayovers.join(", ")}`);
      if (pairings.preferLayovers.length)
        parts.push(`prefer ${pairings.preferLayovers.join(", ")}`);
      return parts.join("; ");
    case "specificPairings":
      return pairings.specific.map((p) => `${p.number} on ${shortDay(p.date)}`).join(", ");
    case "credit":
      return line.creditMinutes
        ? `${hours(line.creditMinutes.min)}–${hours(line.creditMinutes.max)} hours`
        : "";
    case "workBlocks":
      if (line.maxDaysOn !== undefined) parts.push(`At most ${line.maxDaysOn} days on`);
      if (line.minDaysOffInARow !== undefined)
        parts.push(`${line.minDaysOffInARow}+ days off in a row`);
      if (line.commutable) parts.push("commutable");
      return parts.join(", ");
  }
}
