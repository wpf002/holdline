import { Award, BidIntent, Pairing } from "@holdline/types";
import { describe, expect, it } from "vitest";
import { compile } from "../index.js";
import { estimateHolds, parseAwardFile } from "./index.js";

describe("parseAwardFile", () => {
  it("keeps seniority and awards, drops names and employee numbers, reports bad rows", () => {
    const csv = [
      "Name,Emp,Seniority,Pairing,Start_Date,Line_Credit,Reserve",
      "Pat Doe,012345,12,D101,2026-09-03,,N",
      "Sam Roe,023456,55,,,82:30,",
      "Lee Poe,034567,150,,,,Y",
      "Kim Coe,045678,77,D105,,,",
      "Ash Moe,056789,80,,,,",
      "Bo Zoe,067890,x,D110,2026-09-20,,",
    ].join("\n");
    const { awards, errors } = parseAwardFile("holdline-awards-csv", csv);

    expect(awards).toEqual([
      { seniority: 12, pairingNumber: "D101", pairingDate: "2026-09-03", reserve: false },
      { seniority: 55, lineCreditMinutes: 4950, reserve: false },
      { seniority: 150, reserve: true },
    ]);
    expect(JSON.stringify(awards)).not.toMatch(/012345|Pat|Doe/);
    expect(errors).toEqual([
      { line: 5, message: "pairing needs a start_date: pairing numbers repeat across dates." },
      { line: 6, message: "Nothing awarded on this row: add pairing, line_credit or reserve." },
      { line: 7, message: "seniority: Invalid input: expected number, received NaN" },
    ]);
  });

  it("needs a seniority column", () => {
    const { errors } = parseAwardFile("holdline-awards-csv", "pairing,start_date\nD1,2026-09-01\n");
    expect(errors[0]!.message).toMatch(/^Missing column: seniority\./);
  });
});

describe("estimateHolds", () => {
  const pairing = (fields: Record<string, unknown>) =>
    Pairing.parse({ days: 3, creditMinutes: 900, ...fields });
  const award = (fields: Record<string, unknown>) => Award.parse(fields);

  const history = [
    {
      month: "2026-08",
      pairings: [pairing({ number: "A1", startDate: "2026-08-06", layovers: ["AUS"] })],
      awards: [
        award({ seniority: 40, pairingNumber: "A1", pairingDate: "2026-08-06" }),
        award({ seniority: 130, reserve: true }),
      ],
    },
    {
      month: "2026-09",
      pairings: [
        pairing({ number: "P1", startDate: "2026-09-03", report: "09:00", layovers: ["AUS"] }),
        pairing({ number: "P2", startDate: "2026-09-10", report: "06:00", layovers: ["ORD"] }),
        pairing({ number: "P3", startDate: "2026-09-15", days: 2, layovers: ["AUS"] }),
      ],
      awards: [
        award({ seniority: 10, pairingNumber: "P2", pairingDate: "2026-09-10" }),
        award({ seniority: 55, pairingNumber: "P1", pairingDate: "2026-09-03" }),
        award({ seniority: 80, pairingNumber: "P3", pairingDate: "2026-09-15" }),
        award({ seniority: 90, lineCreditMinutes: 4800 }),
        award({ seniority: 150, reserve: true }),
        award({ seniority: 170, reserve: true }),
      ],
    },
  ];

  const bid = compile(
    BidIntent.parse({
      airline: "ENY",
      crewGroup: "PILOT",
      month: "2026-10",
      base: "DFW",
      daysOff: { dates: ["2026-10-10"] },
      pairings: { avoidLayovers: ["ORD"], preferLayovers: ["AUS"] },
      priorities: ["daysOff", "layovers"],
    }),
    "NAVBLUE",
  );

  it("reports line and reserve cutoffs per month, newest first", () => {
    const holds = estimateHolds(bid, history, 75);
    expect(holds.seniority).toBe(75);
    expect(holds.months).toEqual([
      { month: "2026-09", lastLineholder: 90, firstReserve: 150 },
      { month: "2026-08", lastLineholder: 40, firstReserve: 130 },
    ]);
  });

  it("estimates only lines that seek pairings and mean the same every month", () => {
    const holds = estimateHolds(bid, history);
    expect(bid.groups[0]!.lines.map((l) => l.text)).toEqual([
      "Start Pairings",
      "Prefer Off Oct 10, 2026",
      "Avoid Pairings If Layover In ORD",
      "Award Pairings If Layover In AUS",
      "Award Pairings",
    ]);
    expect(holds.groups[0]!.lines).toEqual([
      null,
      null,
      null,
      [
        { month: "2026-09", juniorMost: 80, awarded: 2 },
        { month: "2026-08", juniorMost: 40, awarded: 1 },
      ],
      null,
    ]);
  });
});
