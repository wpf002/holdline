import { BidIntent, type CompiledBid } from "@holdline/types";
import { describe, expect, it } from "vitest";
import { compile } from "../../index.js";

const intent = (fields: Record<string, unknown>) =>
  BidIntent.parse({ airline: "UAL", crewGroup: "PILOT", month: "2026-10", base: "EWR", ...fields });
const texts = (bid: CompiledBid) => bid.groups.map((g) => g.lines.map((l) => l.text));

describe("Jeppesen compiler", () => {
  const bid = compile(
    intent({
      daysOff: { ranges: [{ start: "2026-10-10", end: "2026-10-12" }], dates: ["2026-10-20"] },
      pairings: {
        lengthDays: { min: 3, max: 4 },
        avoidLayovers: ["ord"],
        preferLayovers: ["SFO"],
        reportAfter: "08:00",
      },
      waivers: ["1-in-7", "no-same-day-pairings"],
      priorities: ["daysOff", "pairingLength", "layovers"],
    }),
    "JEPPESEN",
  );

  it("writes one bid group per relaxation step, the last keeping only waivers", () => {
    expect(bid).toMatchObject({
      vendor: "JEPPESEN",
      dialect: "ORDERED_GROUPS",
      syntaxVerified: false,
    });
    expect(texts(bid)).toEqual([
      [
        "Bid Group 1",
        "WAIVE 1 in 7 Day Off in Base",
        "AVOID Work 10 Oct -- 12 Oct",
        "AVOID Work 20 Oct -- 20 Oct",
        "AVOID Pairing Length = 1",
        "AVOID Pairing Length = 2",
        "AVOID Pairing Length = 5",
        "AVOID Pairing Length = 6",
        "AVOID Layover Station and Length Any ORD",
        "AWARD Layover Station and Length Any SFO - HIGH",
      ],
      [
        "Bid Group 2",
        "WAIVE 1 in 7 Day Off in Base",
        "AVOID Work 10 Oct -- 12 Oct",
        "AVOID Work 20 Oct -- 20 Oct",
        "AVOID Pairing Length = 1",
        "AVOID Pairing Length = 2",
        "AVOID Pairing Length = 5",
        "AVOID Pairing Length = 6",
      ],
      [
        "Bid Group 3",
        "WAIVE 1 in 7 Day Off in Base",
        "AVOID Work 10 Oct -- 12 Oct",
        "AVOID Work 20 Oct -- 20 Oct",
      ],
      ["Bid Group 4", "WAIVE 1 in 7 Day Off in Base"],
    ]);
    expect(bid.groups.map((g) => g.relaxed)).toEqual([
      [],
      ["layovers"],
      ["pairingLength", "layovers"],
      ["daysOff", "pairingLength", "layovers"],
    ]);
  });

  it("warns for everything without documented United wording", () => {
    expect(bid.warnings).toEqual([
      "Skipped report and release times: Holdline doesn't have United's wording for it yet.",
      "Skipped waiver \"no-same-day-pairings\": Holdline doesn't have United's wording for it yet.",
    ]);
  });

  it("turns days of the week into dated AVOID Work windows", () => {
    const weekends = compile(
      intent({ daysOff: { daysOfWeek: ["SAT", "SUN"] }, priorities: ["daysOff"] }),
      "JEPPESEN",
    );
    expect(texts(weekends)[0]!.slice(1, 3)).toEqual([
      "AVOID Work 03 Oct -- 04 Oct",
      "AVOID Work 10 Oct -- 11 Oct",
    ]);
    expect(texts(weekends)[0]).toHaveLength(6);
  });

  it("caps groups at the deployment's maxGroups", () => {
    const capped = compile(
      intent({
        daysOff: { dates: ["2026-10-05"] },
        pairings: { lengthDays: { min: 2, max: 2 }, avoidLayovers: ["ORD"] },
        priorities: ["daysOff", "pairingLength", "layovers"],
      }),
      "JEPPESEN",
      { maxGroups: 2 },
    );
    expect(capped.groups.map((g) => g.relaxed)).toEqual([
      [],
      ["daysOff", "pairingLength", "layovers"],
    ]);
    expect(capped.warnings).toContain(
      "Used 2 bid groups, the most this airline allows; skipped 2 relaxation steps.",
    );
  });

  it("doesn't write reserve bids", () => {
    const reserve = compile(intent({ lineType: "RESERVE", priorities: ["daysOff"] }), "JEPPESEN");
    expect(reserve.groups).toEqual([]);
    expect(reserve.warnings).toEqual(["Holdline can't write Jeppesen reserve bids yet."]);
  });
});
