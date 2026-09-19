import { describe, expect, it } from "vitest";
import { relaxationSteps, resolvePriorities } from "./relax.js";

describe("resolvePriorities", () => {
  it("keeps the ranked order, drops duplicates and keys with no lines, appends unranked keys", () => {
    const result = resolvePriorities(
      ["credit", "daysOff", "credit", "specificPairings"],
      ["daysOff", "layovers", "credit"],
    );
    expect(result).toEqual({ order: ["credit", "daysOff", "layovers"], unranked: ["layovers"] });
  });
});

describe("relaxationSteps", () => {
  it("produces one step per dropped preference, ending in a hard-constraints-only step", () => {
    const { steps, skipped } = relaxationSteps(["daysOff", "pairingLength", "credit"]);
    expect(steps).toEqual([
      { keep: ["daysOff", "pairingLength", "credit"], dropped: [] },
      { keep: ["daysOff", "pairingLength"], dropped: ["credit"] },
      { keep: ["daysOff"], dropped: ["pairingLength", "credit"] },
      { keep: [], dropped: ["daysOff", "pairingLength", "credit"] },
    ]);
    expect(skipped).toEqual([]);
  });

  it("caps at maxGroups, keeping the strictest steps and the final hard-only step", () => {
    const { steps, skipped } = relaxationSteps(["daysOff", "pairingLength", "credit"], 3);
    expect(steps.map((s) => s.keep)).toEqual([
      ["daysOff", "pairingLength", "credit"],
      ["daysOff", "pairingLength"],
      [],
    ]);
    expect(skipped.map((s) => s.keep)).toEqual([["daysOff"]]);
  });

  it("is a single hard-only step when nothing is ranked", () => {
    expect(relaxationSteps([]).steps).toEqual([{ keep: [], dropped: [] }]);
  });
});
