import { BidIntent, CompiledBid, type DeploymentConfig } from "@holdline/types";
import { describe, expect, it } from "vitest";
import { compile } from "../../index.js";

/** Golden tests: exact NAVBLUE line text, in order. Changing output wording means changing these. */

const base = { airline: "ENY", crewGroup: "PILOT", month: "2026-10", base: "DFW" } as const;
const intent = (fields: Record<string, unknown>) => BidIntent.parse({ ...base, ...fields });
const texts = (bid: CompiledBid) => bid.groups.map((g) => g.lines.map((l) => l.text));

/** Envoy flight attendant windows, ENVOY_AFA p.7: minimum 65-91h, normal 75-91h, maximum 91-110h. */
const envoyFaWindows: DeploymentConfig = {
  creditWindows: {
    minimum: { min: 65 * 60, max: 91 * 60 },
    normal: { min: 75 * 60, max: 91 * 60 },
    maximum: { min: 91 * 60, max: 110 * 60 },
  },
};

describe("NAVBLUE compiler", () => {
  it("days off only: one Prefer Off line, dates in priority order", () => {
    const bid = compile(
      intent({
        daysOff: { dates: ["2026-10-24", "2026-10-23", "2026-10-25"] },
        priorities: ["daysOff"],
      }),
      "NAVBLUE",
    );
    expect(CompiledBid.parse(bid)).toEqual(bid);
    expect(bid).toMatchObject({
      vendor: "NAVBLUE",
      dialect: "ORDERED_GROUPS",
      syntaxVerified: false,
      warnings: [],
    });
    expect(texts(bid)).toEqual([
      ["Start Pairings", "Prefer Off Oct 24, 2026, Oct 23, 2026, Oct 25, 2026", "Award Pairings"],
    ]);
    expect(bid.groups[0]!.lines[1]).toEqual({
      kind: "PREFER_OFF",
      text: "Prefer Off Oct 24, 2026, Oct 23, 2026, Oct 25, 2026",
      uiPath: ["Prefer Off", "Dates List", "Click Oct 24, Oct 23, Oct 25 in that order", "Apply"],
      preference: "daysOff",
      match: { type: "worksOn", dates: ["2026-10-24", "2026-10-23", "2026-10-25"] },
    });
  });

  it("days off + trip length + report after: negatives in priority order", () => {
    const bid = compile(
      intent({
        daysOff: {
          ranges: [{ start: "2026-10-10", end: "2026-10-12" }],
          daysOfWeek: ["SAT", "SUN"],
        },
        pairings: { lengthDays: { min: 3, max: 4 }, reportAfter: "08:00" },
        priorities: ["daysOff", "pairingLength", "reportRelease"],
      }),
      "NAVBLUE",
    );
    expect(texts(bid)).toEqual([
      [
        "Start Pairings",
        "Prefer Off Oct 10, 2026 - Oct 12, 2026",
        "Prefer Off Saturday, Sunday",
        "Avoid Pairings If Pairing Length < 3 days",
        "Avoid Pairings If Pairing Length > 4 days",
        "Avoid Pairings If Pairing Check-In Time Before < 08:00",
        "Award Pairings",
      ],
    ]);
    expect(bid.groups[0]!.lines[5]!.uiPath).toEqual([
      "Avoid Pairings",
      "Pairing Check-In Time",
      "Before <",
      "08:00",
      "Apply",
    ]);
    expect(bid.warnings).toEqual([]);
  });

  it("layover prefs: avoids with the negatives, prefers as an Award line below them", () => {
    const bid = compile(
      intent({
        pairings: {
          preferLayovers: ["aus", "SAN", "ORD"],
          avoidLayovers: ["ORD", "LGA"],
          releaseBefore: "18:00",
        },
        priorities: ["layovers", "reportRelease"],
      }),
      "NAVBLUE",
    );
    expect(texts(bid)).toEqual([
      [
        "Start Pairings",
        "Avoid Pairings If Layover In ORD, LGA",
        "Avoid Pairings If Pairing Check-Out Time After > 18:00",
        "Award Pairings If Layover In AUS, SAN",
        "Award Pairings",
      ],
    ]);
    expect(bid.warnings).toEqual(["ORD listed as both preferred and avoided layovers; avoiding."]);
  });

  it("credit window via Set Condition: picks the airline window the range falls in", () => {
    const withCredit = (min: number, max: number) =>
      compile(
        intent({
          daysOff: { dates: ["2026-10-31"] },
          line: { creditMinutes: { min: min * 60, max: max * 60 } },
          pairings: { preferLayovers: ["SAN"] },
          priorities: ["credit", "daysOff", "layovers"],
        }),
        "NAVBLUE",
        envoyFaWindows,
      );

    expect(texts(withCredit(65, 72))).toEqual([
      [
        "Start Pairings",
        "Set Condition Minimum Credit Window",
        "Prefer Off Oct 31, 2026",
        "Award Pairings If Layover In SAN",
        "Award Pairings",
      ],
    ]);
    expect(withCredit(65, 72).groups[0]!.lines[2]!.uiPath).toEqual([
      "Prefer Off",
      "Dates List",
      "Click Oct 31",
      "Apply",
    ]);
    expect(texts(withCredit(95, 105))[0]![1]).toBe("Set Condition Maximum Credit Window");

    const normal = withCredit(75, 85);
    expect(texts(normal)[0]).not.toContain("Set Condition Minimum Credit Window");
    expect(normal.warnings).toEqual([
      "Credit 75:00-85:00: NAVBLUE can't target that range. With no credit Set Condition, PBS builds in the normal window (75:00-91:00).",
    ]);

    const unknownWindows = compile(
      intent({ line: { creditMinutes: { min: 3900, max: 4320 } }, priorities: ["credit"] }),
      "NAVBLUE",
    );
    expect(texts(unknownWindows)).toEqual([["Start Pairings", "Award Pairings"]]);
    expect(unknownWindows.warnings[0]).toMatch(/Holdline doesn't have ENY's credit windows yet/);
  });

  it("work blocks become Set Conditions; commutable warns", () => {
    const bid = compile(
      intent({
        line: { maxDaysOn: 4, minDaysOffInARow: 3, commutable: true },
        priorities: ["workBlocks"],
      }),
      "NAVBLUE",
    );
    expect(texts(bid)[0]).toEqual([
      "Start Pairings",
      "Set Condition Maximum Days On In A Row 4",
      "Set Condition Minimum Days Off In A Row 3",
      "Award Pairings",
    ]);
    expect(bid.warnings).toEqual([
      "Skipped commutable: NAVBLUE has no commutable-line condition. Report and release times do that job.",
    ]);
  });

  it("waivers: supported ones at the top, unsupported ones warn", () => {
    const bid = compile(
      intent({
        daysOff: { weekends: true },
        waivers: [
          "no-same-day-pairings",
          "min-days-between-work-blocks",
          "1-in-7",
          "max-5-day-workblock",
          "bogus",
        ],
        priorities: ["daysOff"],
      }),
      "NAVBLUE",
    );
    expect(texts(bid)[0]).toEqual([
      "Start Pairings",
      "Waive No Same Day Pairings",
      "Waive 1 Day Off in 7",
      "Prefer Off Weekends",
      "Award Pairings",
    ]);
    expect(bid.warnings).toEqual([
      'Skipped waiver "min-days-between-work-blocks": not available in NAVBLUE.',
      'Skipped waiver "max-5-day-workblock": reserve bids only.',
      'Skipped waiver "bogus": not available in NAVBLUE.',
    ]);
  });

  it("relaxation: one group, least important negatives at the bottom where Denial Mode drops them first", () => {
    const bid = compile(
      intent({
        daysOff: { dates: ["2026-10-10", "2026-10-11"] },
        pairings: {
          lengthDays: { min: 2, max: 2 },
          reportAfter: "09:00",
          avoidLayovers: ["EWR"],
          preferLayovers: ["MSY"],
          specific: [{ number: "D1234", date: "2026-10-05" }],
          avoidRedeyes: true,
          avoidDeadheads: true,
          maxLegsPerDuty: 3,
        },
        line: { creditMinutes: { min: 3900, max: 4200 } },
        priorities: [
          "reportRelease",
          "specificPairings",
          "daysOff",
          "credit",
          "layovers",
          "pairingLength",
        ],
      }),
      "NAVBLUE",
      envoyFaWindows,
    );
    expect(bid.groups).toHaveLength(1);
    expect(bid.groups[0]!.relaxed).toEqual([]);
    expect(texts(bid)[0]).toEqual([
      "Start Pairings",
      // Hard constraints: kept in every relaxation, so Denial Mode reaches them last.
      "Avoid Pairings If Any Leg is Redeye",
      "Avoid Pairings If Deadhead Legs > 0 legs",
      "Avoid Pairings If Duty Legs > 3 legs",
      // Negatives in priority order.
      "Avoid Pairings If Pairing Check-In Time Before < 09:00",
      "Prefer Off Oct 10, 2026, Oct 11, 2026",
      "Set Condition Minimum Credit Window",
      "Avoid Pairings If Layover In EWR",
      "Avoid Pairings If Pairing Length < 2 days",
      "Avoid Pairings If Pairing Length > 2 days",
      // Awards in priority order, below every Set Condition.
      "Award Pairings If Departing on October 5, 2026 If Pairing Number D1234",
      "Award Pairings If Layover In MSY",
      "Award Pairings",
    ]);
    expect(bid.groups[0]!.lines.map((l) => l.preference ?? "-")).toEqual([
      "-",
      "-",
      "-",
      "-",
      "reportRelease",
      "daysOff",
      "credit",
      "layovers",
      "pairingLength",
      "pairingLength",
      "specificPairings",
      "layovers",
      "-",
    ]);
  });

  it("unranked preferences go last with a warning; out-of-month dates are skipped or trimmed", () => {
    const bid = compile(
      intent({
        daysOff: {
          dates: ["2026-11-02", "2026-10-15"],
          ranges: [
            { start: "2026-10-30", end: "2026-11-03" },
            { start: "2026-09-01", end: "2026-09-03" },
          ],
        },
        pairings: { avoidLayovers: ["ORD"] },
        priorities: ["daysOff"],
      }),
      "NAVBLUE",
    );
    expect(texts(bid)[0]).toEqual([
      "Start Pairings",
      "Prefer Off Oct 15, 2026",
      "Prefer Off Oct 30, 2026 - Oct 31, 2026",
      "Avoid Pairings If Layover In ORD",
      "Award Pairings",
    ]);
    expect(bid.warnings).toEqual([
      "Skipped days off outside the October 2026 bid period: Nov 02, 2026.",
      "Trimmed days off Oct 30, 2026 - Nov 03, 2026 to the October 2026 bid period.",
      "Skipped days off Sep 01, 2026 - Sep 03, 2026: outside the October 2026 bid period.",
      "Ranked last because they're missing from your priorities: layovers.",
    ]);
  });

  it("reserve line type: Start Reserve Bid group, then a Start Reserve group with reserve-safe lines", () => {
    const bid = compile(
      intent({
        lineType: "RESERVE",
        daysOff: { dates: ["2026-10-24", "2026-10-25"] },
        pairings: { lengthDays: { min: 3, max: 3 }, avoidRedeyes: true },
        line: { minDaysOffInARow: 3 },
        waivers: ["max-5-day-workblock"],
        priorities: ["daysOff", "pairingLength", "workBlocks"],
      }),
      "NAVBLUE",
    );
    expect(texts(bid)).toEqual([
      ["Start Reserve Bid"],
      [
        "Start Reserve",
        "Waive Max 5 Day Workblock",
        "Prefer Off Oct 24, 2026, Oct 25, 2026",
        "Set Condition Minimum Days Off In A Row 3",
      ],
    ]);
    expect(bid.groups.map((g) => g.label)).toEqual(["Bid Group 1", "Bid Group 2"]);
    expect(bid.groups[0]!.lines[0]!.uiPath).toEqual([
      "Bids tab",
      "Current or Default tab",
      "Add Bid Group",
      "Start Reserve Bid",
      "Apply",
    ]);
    expect(bid.warnings).toEqual([
      "Skipped trip length: not available in a NAVBLUE reserve group.",
      "Skipped red-eye, deadhead and legs-per-duty limits: not available in a NAVBLUE reserve group.",
      "Reserve bidding depends on your airline's reserve setup. Check that Add Bid Group offers Start Reserve Bid before entering this.",
    ]);
  });

  it("airline label overrides and line limits come from the deployment config", () => {
    const bid = compile(
      intent({ daysOff: { dates: ["2026-10-01"], weekends: true }, priorities: ["daysOff"] }),
      "NAVBLUE",
      { labels: { "group.pairings": "Pairing Bid Group" }, maxBidLines: 2 },
    );
    expect(texts(bid)[0]![0]).toBe("Pairing Bid Group");
    expect(bid.warnings).toEqual(["This bid has 3 lines; ENY accepts 2."]);
  });

  it("KICKOFF example: Envoy DFW pilot", () => {
    const bid = compile(
      intent({
        daysOff: { ranges: [{ start: "2026-10-10", end: "2026-10-12" }] },
        pairings: { lengthDays: { min: 3, max: 3 }, reportAfter: "08:00", avoidLayovers: ["ORD"] },
        line: { creditMinutes: { min: 75 * 60, max: 85 * 60 } },
        priorities: ["daysOff", "pairingLength", "reportRelease", "layovers", "credit"],
      }),
      "NAVBLUE",
    );
    expect(texts(bid)).toEqual([
      [
        "Start Pairings",
        "Prefer Off Oct 10, 2026 - Oct 12, 2026",
        "Avoid Pairings If Pairing Length < 3 days",
        "Avoid Pairings If Pairing Length > 3 days",
        "Avoid Pairings If Pairing Check-In Time Before < 08:00",
        "Avoid Pairings If Layover In ORD",
        "Award Pairings",
      ],
    ]);
    expect(bid.warnings).toHaveLength(1);
  });

  it("other vendors are not built yet", () => {
    expect(() => compile(intent({ priorities: ["daysOff"] }), "JEPPESEN")).toThrow(
      "No compiler for JEPPESEN yet",
    );
  });
});
