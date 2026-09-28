import { describe, expect, it } from "vitest";
import { parseReasons } from "./reasons.js";

/** The shape a NAVBLUE Results screen prints, indentation and all. */
const REPORT = `
   8.    Reserve Bid Group
   9.      Set Condition RSV Call Type R2
 Maximum number of bidders reached
  10.      Set Condition RSV Call Type R1
 Honored
  11.      Set Condition RSV Call Type LC
 Not used
  13.      Set Condition Maximum Days On In A Row 4
 Honored
  14.      Prefer Off Oct 17, 2026, Oct 18, 2026, Oct 24, 2026
 Partially honored
 Awarded Reserve Days:
 2026-10-08 (R1)
 2026-10-09 (R1)
 2026-10-31 (R1)
 Line Complete No Other Bids Required
`;

describe("parseReasons", () => {
  const results = parseReasons(REPORT);

  it("reads each numbered line and what PBS did with it", () => {
    expect(results.lines).toEqual([
      { number: 8, text: "Reserve Bid Group", outcome: "GROUP", note: null },
      {
        number: 9,
        text: "Set Condition RSV Call Type R2",
        outcome: "FULL",
        note: "Maximum number of bidders reached",
      },
      {
        number: 10,
        text: "Set Condition RSV Call Type R1",
        outcome: "HONORED",
        note: "Honored",
      },
      { number: 11, text: "Set Condition RSV Call Type LC", outcome: "NOT_USED", note: "Not used" },
      {
        number: 13,
        text: "Set Condition Maximum Days On In A Row 4",
        outcome: "HONORED",
        note: "Honored",
      },
      {
        number: 14,
        text: "Prefer Off Oct 17, 2026, Oct 18, 2026, Oct 24, 2026",
        outcome: "PARTIAL",
        note: "Partially honored",
      },
    ]);
  });

  it("collects the awarded reserve days and the closing line", () => {
    expect(results.reserveDays).toEqual(["2026-10-08", "2026-10-09", "2026-10-31"]);
    expect(results.complete).toBe(true);
  });

  it("keeps wording it doesn't recognise instead of guessing", () => {
    const odd = parseReasons("  1.   Prefer Off Sunday\n Skipped for crew coverage\n");
    expect(odd.lines[0]).toMatchObject({ outcome: "OTHER", note: "Skipped for crew coverage" });
  });

  it("finds nothing in text that isn't a report", () => {
    expect(parseReasons("Awards\nR1 2026-10-01").lines).toEqual([]);
  });
});
