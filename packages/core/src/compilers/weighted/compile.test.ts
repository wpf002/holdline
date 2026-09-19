import { BidIntent, type CompiledBid } from "@holdline/types";
import { describe, expect, it } from "vitest";
import { compile } from "../../index.js";

const intent = (fields: Record<string, unknown>) =>
  BidIntent.parse({ airline: "EDV", crewGroup: "PILOT", month: "2026-10", base: "MSP", ...fields });
const texts = (bid: CompiledBid) => bid.groups.flatMap((g) => g.lines.map((l) => l.text));

describe("weighted (IBS / AD OPT) compiler", () => {
  const bid = compile(
    intent({
      daysOff: {
        dates: ["2026-10-24", "2026-10-23"],
        daysOfWeek: ["WED"],
        weekends: true,
      },
      pairings: { lengthDays: { min: 3, max: 3 }, avoidLayovers: ["ORD"] },
      line: { maxDaysOn: 4 },
      priorities: ["daysOff", "pairingLength", "workBlocks"],
    }),
    "IBS_ADOPT",
  );

  it("turns priority order into points and splits recurring days across the month", () => {
    expect(bid).toMatchObject({ vendor: "IBS_ADOPT", dialect: "WEIGHTED", syntaxVerified: false });
    expect(texts(bid)).toEqual([
      "Desire Specific Date Off Oct 24, 2026 (1000 points)",
      "Desire Specific Date Off Oct 23, 2026 (950 points)",
      // Four Wednesdays at 250 total 1000, not 4x one date.
      "Desire Days Off Wednesday (250 points)",
      "Desire Weekends Off (200 points)",
      "Desire Pairing Length In Days equal to 3 days (667 points)",
      "Avoid Pairing Length In Days greater than 3 days (667 points)",
      "Avoid Consecutive Working Days Greater Than 4 (333 points)",
    ]);
    expect(bid.groups[0]!.lines[0]!.uiPath).toEqual([
      "Add a bid",
      "Desire Specific Date Off",
      "Oct 24, 2026",
      "Points: 1000",
    ]);
  });

  it("warns for preferences without a documented IBS option", () => {
    expect(bid.warnings).toEqual(["Skipped layovers: no documented IBS option for it yet."]);
  });

  it("doesn't write reserve bids", () => {
    const reserve = compile(intent({ lineType: "RESERVE", priorities: ["daysOff"] }), "IBS_ADOPT");
    expect(reserve.groups).toEqual([]);
    expect(reserve.warnings[0]).toMatch(/can't write IBS reserve bids yet/);
  });
});
