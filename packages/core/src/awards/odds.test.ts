import { describe, expect, it } from "vitest";
import { lineOdds } from "./odds.js";

const lines = { pairingLines: 243, reserveLines: 66 };

describe("lineOdds", () => {
  it("puts a senior number inside the pairing lines", () => {
    expect(lineOdds("2026-10", lines, 150)).toEqual({
      month: "2026-10",
      seniority: 150,
      pairingLines: 243,
      reserveLines: 66,
      outcome: "LINE",
      toReserve: 93,
    });
  });

  it("calls the last pairing line a line, and the next number reserve", () => {
    expect(lineOdds("2026-10", lines, 243)).toMatchObject({ outcome: "LINE", toReserve: 0 });
    expect(lineOdds("2026-10", lines, 244)).toMatchObject({ outcome: "RESERVE", toReserve: -1 });
  });

  it("flags a number past every line the base is building", () => {
    expect(lineOdds("2026-10", lines, 310)).toMatchObject({ outcome: "BEYOND" });
  });

  it("says nothing without a seniority number, and nothing without counts", () => {
    expect(lineOdds("2026-10", lines)).toMatchObject({ outcome: "UNKNOWN", toReserve: null });
    expect(lineOdds("2026-10", { pairingLines: null })).toBeNull();
  });
});
