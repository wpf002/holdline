import type { BidResultLine, BidResults } from "@holdline/types";

/**
 * The Reasons report on a NAVBLUE Results screen: every numbered bid line, what PBS did with it,
 * and the reserve days awarded. Crew members copy it out of the web UI, so the parser is forgiving
 * about indentation and blank lines.
 *
 *      9.      Set Condition RSV Call Type R2
 *    Maximum number of bidders reached
 *     10.      Set Condition RSV Call Type R1
 *    Honored
 *     14.      Prefer Off Oct 17, 2026, Oct 18, 2026
 *    Partially honored
 *    Awarded Reserve Days:
 *    2026-10-08 (R1)
 *    Line Complete No Other Bids Required
 */

const NUMBERED = /^\s*(\d{1,3})\.\s+(\S.*?)\s*$/;
const RESERVE_DAY = /^\s*(\d{4}-\d{2}-\d{2})(?:\s*\((\w+)\))?\s*$/;
const AWARDED_HEADER = /^\s*Awarded Reserve Days:/i;
const COMPLETE = /Line Complete No Other Bids Required/i;

/** Outcome wording NAVBLUE writes, normalised. Anything else is kept verbatim as OTHER. */
const OUTCOMES: { match: RegExp; outcome: BidResultLine["outcome"] }[] = [
  { match: /^partially honou?red/i, outcome: "PARTIAL" },
  { match: /^honou?red/i, outcome: "HONORED" },
  { match: /^not used/i, outcome: "NOT_USED" },
  { match: /^maximum number of bidders reached/i, outcome: "FULL" },
  { match: /^denied|^could not/i, outcome: "DENIED" },
];

function classify(text: string): BidResultLine["outcome"] {
  return OUTCOMES.find((o) => o.match.test(text))?.outcome ?? "OTHER";
}

/** A group header carries no outcome of its own. */
const isGroupHeader = (text: string) => /bid group\s*$/i.test(text);

export function parseReasons(text: string): BidResults {
  const lines: BidResultLine[] = [];
  const reserveDays: string[] = [];
  let complete = false;
  let awardedSection = false;
  let current: BidResultLine | undefined;

  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    if (COMPLETE.test(raw)) {
      complete = true;
      continue;
    }
    if (AWARDED_HEADER.test(raw)) {
      awardedSection = true;
      continue;
    }

    const numbered = NUMBERED.exec(raw);
    if (numbered) {
      awardedSection = false;
      current = { number: Number(numbered[1]), text: numbered[2]!, outcome: "OTHER", note: null };
      if (isGroupHeader(current.text)) current.outcome = "GROUP";
      lines.push(current);
      continue;
    }

    const day = RESERVE_DAY.exec(raw);
    if (day && awardedSection) {
      reserveDays.push(day[1]!);
      continue;
    }

    // Anything else describes the line above it.
    if (current && current.outcome === "OTHER" && current.note === null) {
      current.note = raw.trim();
      current.outcome = classify(raw.trim());
    }
  }

  return { lines, reserveDays, complete };
}
