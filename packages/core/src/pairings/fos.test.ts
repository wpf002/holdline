import { describe, expect, it } from "vitest";
import { parseFosText } from "./fos.js";

/**
 * Two blocks in the shape a bid package PDF extracts to, including the quirk that puts the last
 * calendar row at the end of the first leg line. Real packages stay in data/private.
 */
const PACKAGE = `
BID SUMMARY:
Average Line Value - ALV 83:01
Minimum Credit Window 70:01 – 80:01
Normal Credit Window 76:01 – 90:01
Maximum Credit Window 86:01 – 100:01
Total Pairing Lines Target 243
Total RSV Lines Target 66

E7M PILOT CARRY-IN PAIRINGS SEP 28 - SEP 30, 2026 - ORD
========================================================================
13999 BASE REPT: 0600L Mo Tu We Th Fr Sa Su
Base : ORD (CA01FO01) 29 30
1 3000 ORD-DEN 0645 0837 252 30 E7M
1 3000 DEN-ORD 0907 1256 249 E7M 541 0 541 711
D-END: 1311L FDP: 0656 FDPLim: 1300
TOTALS BLK 541 DHD 0 TRIP RIG: 0 CDT 541 T.A.F.B. 711 LDGS: 2
========================================================================
E7M PILOT PAIRINGS OCT 1 - OCT 31, 2026 - ORD
========================================================================
14102 BASE REPT: 0600L Mo Tu We Th Fr Sa Su
Base : ORD (CA01FO01) 1 2 3 4
-- -- -- -- -- -- --
1 3964 ORD-DEN 0645 0837 252 30 E7M
1 3964 DEN-ORD 0907 1256 249 E7M 541 0 541 711
D-END: 1311L FDP: 0656 FDPLim: 1300
TOTALS BLK 541 DHD 0 TRIP RIG: 0 CDT 541 T.A.F.B. 711 LDGS: 2
========================================================================
14011 BASE REPT: 1630L Mo Tu We Th Fr Sa Su
Base : ORD (CA01FO01) -- -- -- --
-- -- -- -- -- -- --
WE DH 489 ORD-DCA 1700 2006 206 203 AA -- -- 30
WE 3441 DCA-CMH 2209 2336 127 E7M 127 206 333 621 1522
D-END: 2351L REPT: 1513L FDP: 0606 FDPLim: 1200
Marriott Columbus Airport 614--475-7551
TH 3922 CMH-ORD 0558 0705 207 E7M 437 0 437 607
D-END: 0720L FDP: 0552 FDPLim: 1200
TOTALS BLK 1259 DHD 206 TRIP RIG: 0 CDT 1505 T.A.F.B. 5119 LDGS: 3
========================================================================
`;

describe("parseFosText", () => {
  const { pairings, errors, summary } = parseFosText(PACKAGE, "2026-10");

  it("makes one pairing per day the calendar marks", () => {
    expect(pairings.filter((p) => p.number === "14102").map((p) => p.startDate)).toEqual([
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
  });

  it("reads the calendar row that lands at the end of a leg line", () => {
    expect(pairings.filter((p) => p.number === "14011").map((p) => p.startDate)).toEqual([
      "2026-10-30",
    ]);
  });

  it("reads totals, report, release, layovers and deadheads", () => {
    const pairing = pairings.find((p) => p.number === "14011")!;
    expect(pairing).toMatchObject({
      days: 2,
      creditMinutes: 15 * 60 + 5,
      tafbMinutes: 51 * 60 + 19,
      report: "16:30",
      release: "07:20",
      layovers: ["CMH"],
    });
    expect(pairing.legs[0]).toEqual({
      duty: 1,
      flight: "489",
      from: "ORD",
      to: "DCA",
      departs: "2026-10-30T17:00",
      arrives: "2026-10-30T20:06",
      deadhead: true,
    });
    // The second duty flies the next calendar day.
    expect(pairing.legs.at(-1)!.departs).toBe("2026-10-31T05:58");
  });

  it("skips the previous month's carry-in pairings and says how many", () => {
    expect(pairings.some((p) => p.number === "13999")).toBe(false);
    expect(errors).toEqual([
      { line: 0, message: "Skipped 1 carry-in pairing from the previous month." },
    ]);
  });

  it("reads the line counts and credit windows off the summary page", () => {
    expect(summary).toEqual({
      pairingLines: 243,
      reserveLines: 66,
      creditWindows: {
        normal: { min: 4561, max: 5401 },
        minimum: { min: 4201, max: 4801 },
        maximum: { min: 5161, max: 6001 },
      },
    });
  });

  it("says so when the text isn't a bid package", () => {
    expect(parseFosText("pairing,days\nD1,3\n", "2026-10").errors).toEqual([
      { line: 0, message: "No pairing blocks found. Is this a FOS bid package?" },
    ]);
  });
});
