import type { LineOdds } from "@holdline/types";

/** What the bid package publishes about this base and seat. */
export interface PublishedLines {
  pairingLines?: number | null;
  reserveLines?: number | null;
}

/**
 * Where a seniority number falls against the lines the airline is building this month.
 *
 * PBS awards in seniority order, so the crew member holding line N is the Nth most senior bidder.
 * Past the pairing lines, what's left is reserve. This says nothing about which pairings are
 * holdable, only whether a line is: that's what award history is for, when there is any.
 *
 * Returns null when the package didn't carry a pairing-line count.
 */
export function lineOdds(
  month: string,
  lines: PublishedLines,
  seniority?: number,
): LineOdds | null {
  const pairingLines = lines.pairingLines ?? null;
  if (pairingLines === null) return null;
  const reserveLines = lines.reserveLines ?? 0;

  if (seniority === undefined) {
    return {
      month,
      seniority: null,
      pairingLines,
      reserveLines,
      outcome: "UNKNOWN",
      toReserve: null,
    };
  }
  return {
    month,
    seniority,
    pairingLines,
    reserveLines,
    outcome:
      seniority <= pairingLines
        ? "LINE"
        : seniority <= pairingLines + reserveLines
          ? "RESERVE"
          : "BEYOND",
    // Positive: seniority numbers to spare. Zero: the last line. Negative: already on reserve.
    toReserve: pairingLines - seniority,
  };
}
