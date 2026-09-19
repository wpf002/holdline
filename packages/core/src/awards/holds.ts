import type {
  Award,
  CompiledBid,
  HoldEstimates,
  LineHold,
  MonthCutoff,
  Pairing,
  PairingMatch,
} from "@holdline/types";
import { effectOf, matchPairing } from "../pairings/pool.js";

/** One past bid period: its pairings and who was awarded what. */
export interface HistoryMonth {
  month: string;
  pairings: Pairing[];
  awards: Award[];
}

/** Matches about a trip's shape rather than calendar dates, so they mean the same in any month. */
const CARRIES_OVER = new Set<PairingMatch["type"]>([
  "worksOnWeekday",
  "worksWeekend",
  "lengthBelow",
  "lengthAbove",
  "lengthIs",
  "lengthBetween",
  "reportBefore",
  "releaseAfter",
  "reportBetween",
  "releaseBetween",
  "layoverIn",
  "redeye",
  "deadhead",
  "dutyLegsAbove",
]);

function cutoff(m: HistoryMonth): MonthCutoff {
  const line = m.awards.filter((a) => !a.reserve).map((a) => a.seniority);
  const reserve = m.awards.filter((a) => a.reserve).map((a) => a.seniority);
  return {
    month: m.month,
    lastLineholder: line.length ? Math.max(...line) : null,
    firstReserve: reserve.length ? Math.min(...reserve) : null,
  };
}

function lineHold(match: PairingMatch, m: HistoryMonth): LineHold {
  const matching = new Set(
    m.pairings
      .filter((p) => matchPairing(match, p) === true)
      .map((p) => `${p.number}@${p.startDate}`),
  );
  const holders = m.awards.filter(
    (a) => a.pairingNumber && a.pairingDate && matching.has(`${a.pairingNumber}@${a.pairingDate}`),
  );
  return {
    month: m.month,
    juniorMost: holders.length ? Math.max(...holders.map((a) => a.seniority)) : null,
    awarded: holders.length,
  };
}

/**
 * How far down the seniority list lines, and pairings like each bid line asks for, went in past
 * months. Only lines that seek pairings (Award lines, layered properties that keep or prefer) get
 * estimates; lines about dates or that remove pairings don't carry over between months.
 */
export function estimateHolds(
  bid: CompiledBid,
  history: HistoryMonth[],
  seniority?: number,
): HoldEstimates {
  const months = [...history].sort((a, b) => b.month.localeCompare(a.month));
  return {
    seniority: seniority ?? null,
    months: months.map(cutoff),
    groups: bid.groups.map((group) => ({
      lines: group.lines.map((line) => {
        const match = line.match;
        if (!match || !CARRIES_OVER.has(match.type) || effectOf(line) === "remove") return null;
        return months.map((m) => lineHold(match, m));
      }),
    })),
  };
}
