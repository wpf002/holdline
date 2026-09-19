import { describe, expect, it } from "vitest";
import {
  bidMonths,
  calendarWeeks,
  describePreference,
  emptyDraft,
  orderedPriorities,
  rangeLabel,
  toggle,
} from "./draft";

const context = { airline: "ENY", crewGroup: "PILOT", month: "2026-10", base: "DFW" } as const;

describe("calendarWeeks", () => {
  it("lays October 2026 out Sunday-first with the 1st on a Thursday", () => {
    const weeks = calendarWeeks("2026-10");
    expect(weeks).toHaveLength(5);
    expect(weeks[0]).toEqual([null, null, null, null, "2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(weeks[4]).toEqual([
      "2026-10-25",
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
    ]);
  });

  it("pads the last week of February 2027", () => {
    const weeks = calendarWeeks("2027-02");
    expect(weeks.flat().filter(Boolean)).toHaveLength(28);
    expect(weeks.at(-1)!.at(-1)).toBeNull();
  });
});

describe("bidMonths", () => {
  it("returns this month and the next two across a year end", () => {
    expect(bidMonths(new Date(Date.UTC(2026, 10, 19)))).toEqual(["2026-11", "2026-12", "2027-01"]);
  });
});

describe("toggle", () => {
  it("appends new items last and removes existing ones", () => {
    expect(toggle(["a", "b"], "c")).toEqual(["a", "b", "c"]);
    expect(toggle(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });
});

describe("orderedPriorities", () => {
  it("keeps the crew member's order for filled-in preferences and appends new ones", () => {
    const draft = emptyDraft(context);
    draft.daysOff.dates = ["2026-10-10"];
    draft.pairings.avoidLayovers = ["ORD"];
    draft.line.creditMinutes = { min: 4500, max: 5100 };
    draft.priorities = ["credit", "pairingLength", "daysOff", "credit"];
    expect(orderedPriorities(draft)).toEqual(["credit", "daysOff", "layovers"]);
  });
});

describe("describePreference", () => {
  it("summarises each preference in plain terms", () => {
    const draft = emptyDraft(context);
    draft.daysOff = {
      dates: ["2026-10-24"],
      ranges: [{ start: "2026-10-10", end: "2026-10-12" }],
      daysOfWeek: ["SAT", "SUN"],
      weekends: true,
    };
    draft.pairings.lengthDays = { min: 3, max: 3 };
    draft.pairings.reportAfter = "08:00";
    draft.pairings.avoidLayovers = ["ORD"];
    draft.pairings.preferLayovers = ["AUS"];
    draft.pairings.specific = [{ number: "D1234", date: "2026-10-05" }];
    draft.line = { creditMinutes: { min: 4500, max: 5130 }, maxDaysOn: 4, commutable: true };

    expect(describePreference(draft, "daysOff")).toBe("Oct 24, Oct 10–12, Sat/Sun, weekends");
    expect(describePreference(draft, "pairingLength")).toBe("3-day trips");
    expect(describePreference(draft, "reportRelease")).toBe("Report after 08:00");
    expect(describePreference(draft, "layovers")).toBe("Avoid ORD; prefer AUS");
    expect(describePreference(draft, "specificPairings")).toBe("D1234 on Oct 5");
    expect(describePreference(draft, "credit")).toBe("75–85.5 hours");
    expect(describePreference(draft, "workBlocks")).toBe("At most 4 days on, commutable");
  });

  it("words open-ended trip lengths", () => {
    const draft = emptyDraft(context);
    draft.pairings.lengthDays = { min: 1, max: 3 };
    expect(describePreference(draft, "pairingLength")).toBe("Trips up to 3 days");
    draft.pairings.lengthDays = { min: 3, max: 6 };
    expect(describePreference(draft, "pairingLength")).toBe("Trips of 3 days or more");
  });
});

describe("rangeLabel", () => {
  it("shortens same-month ranges and spells out cross-month ones", () => {
    expect(rangeLabel({ start: "2026-10-10", end: "2026-10-12" })).toBe("Oct 10–12");
    expect(rangeLabel({ start: "2026-10-30", end: "2026-11-02" })).toBe("Oct 30–Nov 2");
  });
});
