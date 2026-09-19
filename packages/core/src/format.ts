import type { Weekday } from "@holdline/types";

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

export const WEEKDAY_NAMES: Record<Weekday, string> = {
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
  SAT: "Saturday",
  SUN: "Sunday",
};

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

function parts(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y: y!, m: m!, d: d! };
}

/** "2026-10-05" -> "Oct 05, 2026" */
export function shortDate(iso: string): string {
  const { y, m, d } = parts(iso);
  return `${MONTHS[m - 1]} ${pad(d)}, ${y}`;
}

/** "2026-10-05" -> "Oct 05" */
export function monthDay(iso: string): string {
  const { m, d } = parts(iso);
  return `${MONTHS[m - 1]} ${pad(d)}`;
}

/** "2026-10-05" -> "October 5, 2026" */
export function longDate(iso: string): string {
  const { y, m, d } = parts(iso);
  return `${MONTHS_LONG[m - 1]} ${d}, ${y}`;
}

/** "2026-10" -> "October 2026" */
export function monthName(month: string): string {
  const { y, m } = parts(`${month}-01`);
  return `${MONTHS_LONG[m - 1]} ${y}`;
}

/** First and last ISO date of a "YYYY-MM" bid month. */
export function monthBounds(month: string): { first: string; last: string } {
  const { y, m } = parts(`${month}-01`);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { first: `${month}-01`, last: `${month}-${pad(days)}` };
}

/** 4500 -> "75:00" */
export function hours(minutes: number): string {
  return `${Math.floor(minutes / 60)}:${pad(minutes % 60)}`;
}

/** Every ISO date from start to end, inclusive. */
export function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const [y, m, d] = start.split("-").map(Number);
  for (let i = 0; ; i++) {
    const iso = new Date(Date.UTC(y!, m! - 1, d! + i)).toISOString().slice(0, 10);
    if (iso > end) return out;
    out.push(iso);
  }
}
