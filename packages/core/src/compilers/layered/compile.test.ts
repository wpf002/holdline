import { BidIntent, Pairing, type CompiledBid } from "@holdline/types";
import { describe, expect, it } from "vitest";
import { compile, previewPool } from "../../index.js";

const intent = (fields: Record<string, unknown>) =>
  BidIntent.parse({ airline: "AAL", crewGroup: "PILOT", month: "2026-10", base: "DFW", ...fields });
const texts = (bid: CompiledBid) => bid.groups.map((g) => g.lines.map((l) => l.text));

const full = intent({
  daysOff: {
    dates: ["2026-10-24"],
    ranges: [{ start: "2026-10-10", end: "2026-10-12" }],
    daysOfWeek: ["SUN"],
  },
  pairings: {
    lengthDays: { min: 3, max: 3 },
    reportAfter: "08:00",
    avoidLayovers: ["ORD"],
    preferLayovers: ["AUS"],
    avoidDeadheads: true,
    avoidRedeyes: true,
  },
  line: { creditMinutes: { min: 75 * 60, max: 85 * 60 }, maxDaysOn: 4, commutable: true },
  priorities: ["daysOff", "credit", "pairingLength", "reportRelease", "layovers", "workBlocks"],
});

describe("layered compiler", () => {
  const bid = compile(full, "UNKNOWN", {}, "LAYERED");

  it("writes 7 layers, dropping the least important preference each time", () => {
    expect(bid).toMatchObject({ vendor: "UNKNOWN", dialect: "LAYERED", syntaxVerified: false });
    expect(bid.groups.map((g) => g.label)).toEqual([
      "Layer 1",
      "Layer 2",
      "Layer 3",
      "Layer 4",
      "Layer 5",
      "Layer 6",
      "Layer 7",
    ]);
    expect(texts(bid)[0]).toEqual([
      "Avoid Deadheads",
      "Days Off: 24 Oct, 10 Oct, 11 Oct, 12 Oct",
      "Days Off on Day of Week: Sunday",
      "Target Credit Range: 75:00 - 85:00",
      "Prefer Pairing Length: 3",
      "Report Between: 08:00 and 23:59",
      "Avoid Layover at City: ORD",
      "Layover at City: AUS",
      "Work Block Size: 1 - 4",
      "Commutable Work Block",
    ]);
    expect(texts(bid)[5]).toEqual([
      "Avoid Deadheads",
      "Days Off: 24 Oct, 10 Oct, 11 Oct, 12 Oct",
      "Days Off on Day of Week: Sunday",
    ]);
    expect(texts(bid)[6]).toEqual(["Avoid Deadheads"]);
    expect(bid.groups[1]!.relaxed).toEqual(["workBlocks"]);
    expect(bid.groups[0]!.lines[4]!.uiPath).toEqual([
      "Layer 1",
      "Pairing tab",
      "Prefer Pairing Length",
      "3",
    ]);
    expect(bid.warnings).toEqual([
      "Skipped no red-eyes: Holdline doesn't have a layered PBS property for it yet.",
    ]);
  });

  it("runs AOS through the same compiler and caps at the deployment's layer count", () => {
    const aos = compile({ ...full, waivers: ["1-in-7"] }, "AOS", { layers: 3 });
    expect(aos.vendor).toBe("AOS");
    expect(aos.groups.map((g) => g.relaxed.length)).toEqual([0, 1, 6]);
    expect(aos.warnings).toContain(
      "Used all 3 layers; 4 relaxation steps didn't fit, so layer 3 drops straight to your hard limits.",
    );
    expect(aos.warnings).toContain(
      "Skipped waivers (1-in-7): Holdline doesn't map waivers to layered PBS yet.",
    );
  });

  it("previews layers: pairing properties keep what they match", () => {
    const pairing = (fields: Record<string, unknown>) =>
      Pairing.parse({ creditMinutes: 900, days: 3, ...fields });
    const preview = previewPool(
      bid,
      [
        pairing({ number: "A1", startDate: "2026-10-02", report: "09:00", layovers: ["AUS"] }),
        pairing({
          number: "A2",
          startDate: "2026-10-05",
          days: 2,
          report: "09:00",
          layovers: ["AUS"],
        }),
        pairing({ number: "A3", startDate: "2026-10-14", report: "06:00", layovers: ["AUS"] }),
        pairing({ number: "A4", startDate: "2026-10-20", report: "10:00", layovers: ["ORD"] }),
      ],
      new Date("2026-09-20T00:00:00Z"),
    );
    // Layer 1: deadheads can't be checked (no legs); A1 works Sunday Oct 4; Pairing Length 3 drops
    // A2; Report Between drops A3; ORD removes A4, leaving nothing for Layover at City AUS.
    expect(preview.groups[0]!.lines.map((l) => l?.poolAfter ?? null)).toEqual([
      4,
      4,
      3,
      null,
      2,
      1,
      0,
      0,
      null,
      null,
    ]);
    expect(preview.groups[0]!.lines[0]).toEqual({ matched: 0, poolAfter: 4, unknown: 4 });
  });
});
