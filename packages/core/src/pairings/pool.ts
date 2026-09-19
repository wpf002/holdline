import type {
  CompiledBid,
  LinePreview,
  Pairing,
  PairingMatch,
  PoolPreview,
  Weekday,
} from "@holdline/types";

const WEEKDAYS: Weekday[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** Calendar dates a pairing touches, report day through release day. */
export function workDays(p: Pairing): string[] {
  const [y, m, d] = p.startDate.split("-").map(Number);
  return Array.from({ length: p.days }, (_, i) =>
    new Date(Date.UTC(y!, m! - 1, d! + i)).toISOString().slice(0, 10),
  );
}

const weekday = (iso: string): Weekday => WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()]!;

/** true/false, or null when the pairing doesn't carry the detail this match needs. */
export function matchPairing(match: PairingMatch, p: Pairing): boolean | null {
  const legs = p.legs;
  switch (match.type) {
    case "any":
      return true;
    case "worksOn":
      return workDays(p).some((d) => match.dates.includes(d));
    case "worksOnWeekday":
      return workDays(p).some((d) => match.days.includes(weekday(d)));
    case "worksWeekend":
      return workDays(p).some((d) => ["SAT", "SUN"].includes(weekday(d)));
    case "lengthBelow":
      return p.days < match.days;
    case "lengthAbove":
      return p.days > match.days;
    case "reportBefore":
      return p.report === undefined ? null : p.report < match.time;
    case "releaseAfter":
      return p.release === undefined ? null : p.release > match.time;
    case "layoverIn":
      return p.layovers.some((s) => match.stations.includes(s));
    case "pairingOn":
      return p.number === match.number && p.startDate === match.date;
    case "redeye":
      return legs.length === 0
        ? null
        : legs.some((l) => l.redeye ?? l.arrives.slice(0, 10) > l.departs.slice(0, 10));
    case "deadhead":
      return legs.length === 0 ? null : legs.some((l) => l.deadhead);
    case "dutyLegsAbove": {
      if (legs.length === 0) return null;
      const perDuty = new Map<number, number>();
      for (const l of legs) perDuty.set(l.duty, (perDuty.get(l.duty) ?? 0) + 1);
      return Math.max(...perDuty.values()) > match.legs;
    }
  }
}

/** Kinds that take matching pairings out of the pool for every line below them. */
const REMOVES = new Set(["AVOID", "PREFER_OFF"]);

/**
 * Walks each bid group top-down like NAVBLUE's Bid Analyzer: Avoid and Prefer Off lines shrink the
 * pool, Award lines count what they'd prefer. Groups are independent, so each starts from the full pool.
 */
export function previewPool(bid: CompiledBid, pairings: Pairing[], importedAt: Date): PoolPreview {
  return {
    pairings: pairings.length,
    importedAt: importedAt.toISOString(),
    groups: bid.groups.map((group) => {
      let pool = pairings;
      return {
        lines: group.lines.map((line): LinePreview | null => {
          if (!line.match) return null;
          const results = pool.map((p) => matchPairing(line.match!, p));
          const matched = results.filter((r) => r === true).length;
          const unknown = results.filter((r) => r === null).length;
          if (REMOVES.has(line.kind)) pool = pool.filter((_, i) => results[i] !== true);
          return { matched, poolAfter: pool.length, unknown };
        }),
      };
    }),
  };
}
