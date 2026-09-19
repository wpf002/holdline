import { BidIntent, Pairing } from "@holdline/types";
import { describe, expect, it } from "vitest";
import { compile } from "../index.js";
import { matchPairing, parsePairingFile, previewPool } from "./index.js";

const pairing = (fields: Record<string, unknown>) =>
  Pairing.parse({ days: 3, creditMinutes: 900, ...fields });

describe("parsePairingFile: holdline-csv", () => {
  it("reads rows in any column order and reports bad rows by line", () => {
    const csv = [
      "Credit,Pairing,Start_Date,Days,Report,Release,Layovers,Notes",
      "16:42,D101,2026-10-09,3,07:00,16:33,ORD;aus,ignored",
      "12:00,D102,2026-10-14,2,09:00,,,",
      "",
      "twelve,D103,2026-10-15,3,06:30,,,",
      '"10:05","D104","2026-10-20",4,10:00,18:10,"SAT MSY",',
      "10:05,D104,2026-10-20,4,10:00,18:10,,",
    ].join("\r\n");
    const { pairings, errors } = parsePairingFile("holdline-csv", csv);

    expect(pairings.map((p) => p.number)).toEqual(["D101", "D102", "D104"]);
    expect(pairings[0]).toEqual({
      number: "D101",
      startDate: "2026-10-09",
      days: 3,
      creditMinutes: 1002,
      report: "07:00",
      release: "16:33",
      layovers: ["ORD", "AUS"],
      legs: [],
    });
    expect(pairings[2]!.layovers).toEqual(["SAT", "MSY"]);
    expect(errors).toEqual([
      { line: 5, message: "creditMinutes: Invalid input: expected number, received NaN" },
      { line: 0, message: "Pairing D104 on 2026-10-20 appears more than once; kept the first." },
    ]);
  });

  it("names missing required columns", () => {
    const { pairings, errors } = parsePairingFile("holdline-csv", "pairing,days\nD1,3\n");
    expect(pairings).toEqual([]);
    expect(errors[0]!.message).toMatch(/^Missing column\(s\): start_date, credit\./);
  });
});

describe("parsePairingFile: holdline-json", () => {
  it("fills layovers from legs and reports invalid pairings by position", () => {
    const json = JSON.stringify({
      pairings: [
        {
          number: "D201",
          startDate: "2026-10-05",
          days: 2,
          creditMinutes: 780,
          legs: [
            {
              duty: 1,
              from: "DFW",
              to: "ORD",
              departs: "2026-10-05T08:00",
              arrives: "2026-10-05T10:15",
            },
            {
              duty: 1,
              from: "ORD",
              to: "MSP",
              departs: "2026-10-05T11:30",
              arrives: "2026-10-05T13:00",
            },
            {
              duty: 2,
              from: "MSP",
              to: "DFW",
              departs: "2026-10-06T09:00",
              arrives: "2026-10-06T11:45",
            },
          ],
        },
        { number: "D202", startDate: "2026-10-40", days: 2, creditMinutes: 600 },
      ],
    });
    const { pairings, errors } = parsePairingFile("holdline-json", json);
    expect(pairings).toHaveLength(1);
    expect(pairings[0]!.layovers).toEqual(["MSP"]);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.line).toBe(2);
    expect(errors[0]!.message).toMatch(/^startDate: /);
  });

  it("rejects text that isn't JSON", () => {
    expect(parsePairingFile("holdline-json", "nope").errors[0]!.message).toMatch(/^Not valid JSON/);
  });
});

describe("matchPairing", () => {
  const trip = pairing({
    number: "D1",
    startDate: "2026-10-09",
    report: "07:00",
    layovers: ["ORD"],
    legs: [
      {
        duty: 1,
        from: "DFW",
        to: "ORD",
        departs: "2026-10-09T07:45",
        arrives: "2026-10-09T10:00",
        deadhead: true,
      },
      { duty: 1, from: "ORD", to: "LGA", departs: "2026-10-09T11:00", arrives: "2026-10-09T14:00" },
      { duty: 1, from: "LGA", to: "ORD", departs: "2026-10-09T15:00", arrives: "2026-10-09T17:00" },
      { duty: 2, from: "ORD", to: "LAX", departs: "2026-10-10T22:30", arrives: "2026-10-11T00:45" },
    ],
  });

  it("checks days worked, weekdays and weekends across the whole trip", () => {
    expect(matchPairing({ type: "worksOn", dates: ["2026-10-11"] }, trip)).toBe(true);
    expect(matchPairing({ type: "worksOn", dates: ["2026-10-12"] }, trip)).toBe(false);
    expect(matchPairing({ type: "worksOnWeekday", days: ["SUN"] }, trip)).toBe(true);
    expect(matchPairing({ type: "worksOnWeekday", days: ["MON"] }, trip)).toBe(false);
    expect(matchPairing({ type: "worksWeekend" }, trip)).toBe(true);
  });

  it("checks times, legs and layovers, and says when it can't tell", () => {
    expect(matchPairing({ type: "reportBefore", time: "08:00" }, trip)).toBe(true);
    expect(matchPairing({ type: "releaseAfter", time: "18:00" }, trip)).toBeNull();
    expect(matchPairing({ type: "redeye" }, trip)).toBe(true);
    expect(matchPairing({ type: "deadhead" }, trip)).toBe(true);
    expect(matchPairing({ type: "dutyLegsAbove", legs: 3 }, trip)).toBe(false);
    expect(matchPairing({ type: "dutyLegsAbove", legs: 2 }, trip)).toBe(true);
    expect(matchPairing({ type: "layoverIn", stations: ["ORD"] }, trip)).toBe(true);
    expect(
      matchPairing({ type: "deadhead" }, pairing({ number: "D2", startDate: "2026-10-01" })),
    ).toBeNull();
  });
});

describe("previewPool", () => {
  it("counts what each line of the KICKOFF bid removes, top-down", () => {
    const bid = compile(
      BidIntent.parse({
        airline: "ENY",
        crewGroup: "PILOT",
        month: "2026-10",
        base: "DFW",
        daysOff: { ranges: [{ start: "2026-10-10", end: "2026-10-12" }] },
        pairings: { lengthDays: { min: 3, max: 3 }, reportAfter: "08:00", avoidLayovers: ["ORD"] },
        priorities: ["daysOff", "pairingLength", "reportRelease", "layovers"],
      }),
      "NAVBLUE",
    );
    const pool = [
      pairing({
        number: "D101",
        startDate: "2026-10-09",
        report: "07:00",
        layovers: ["ORD", "AUS"],
      }),
      pairing({ number: "D102", startDate: "2026-10-14", report: "09:00", layovers: ["AUS"] }),
      pairing({ number: "D103", startDate: "2026-10-15", report: "06:30" }),
      pairing({ number: "D104", startDate: "2026-10-20", days: 4, report: "10:00" }),
      pairing({ number: "D105", startDate: "2026-10-22", report: "08:00", layovers: ["ORD"] }),
      pairing({ number: "D106", startDate: "2026-10-25", days: 2, report: "11:00" }),
      pairing({ number: "D107", startDate: "2026-10-27", layovers: ["MSY"] }),
    ];
    const preview = previewPool(bid, pool, new Date("2026-09-20T12:00:00Z"));

    expect(preview.pairings).toBe(7);
    expect(preview.importedAt).toBe("2026-09-20T12:00:00.000Z");
    expect(bid.groups[0]!.lines.map((l) => l.text)).toEqual([
      "Start Pairings",
      "Prefer Off Oct 10, 2026 - Oct 12, 2026",
      "Avoid Pairings If Pairing Length < 3 days",
      "Avoid Pairings If Pairing Length > 3 days",
      "Avoid Pairings If Pairing Check-In Time Before < 08:00",
      "Avoid Pairings If Layover In ORD",
      "Award Pairings",
    ]);
    expect(preview.groups[0]!.lines).toEqual([
      null,
      { matched: 1, poolAfter: 6, unknown: 0 },
      { matched: 1, poolAfter: 5, unknown: 0 },
      { matched: 1, poolAfter: 4, unknown: 0 },
      { matched: 1, poolAfter: 3, unknown: 1 },
      { matched: 1, poolAfter: 2, unknown: 0 },
      { matched: 2, poolAfter: 2, unknown: 0 },
    ]);
  });
});
