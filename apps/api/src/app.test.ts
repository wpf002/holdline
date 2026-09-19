import {
  BidPreferences,
  type CompileResponse,
  type CompiledBid,
  type Pairing,
  type ParseResponse,
} from "@holdline/types";
import { describe, expect, it } from "vitest";
import { buildApp, type AirlineRecord, type Store } from "./app.js";
import { ParserError, type Parser } from "./parse.js";

const airlines: AirlineRecord[] = [
  {
    code: "ENY",
    name: "Envoy Air",
    deployments: [
      {
        id: "eny-pilot",
        crewGroup: "PILOT",
        vendor: "NAVBLUE",
        dialect: "ORDERED_GROUPS",
        confidence: "THIRD_PARTY",
        config: {},
      },
      {
        id: "eny-fa",
        crewGroup: "FLIGHT_ATTENDANT",
        vendor: "NAVBLUE",
        dialect: "ORDERED_GROUPS",
        confidence: "CONFIRMED",
        config: { labels: { "group.pairings": "Pairing Bid Group" } },
      },
    ],
  },
  {
    code: "UAL",
    name: "United Airlines",
    deployments: [
      {
        id: "ual-pilot",
        crewGroup: "PILOT",
        vendor: "JEPPESEN",
        dialect: "ORDERED_GROUPS",
        confidence: "CONFIRMED",
        config: {},
      },
    ],
  },
  {
    code: "RPA",
    name: "Republic Airways",
    deployments: [
      {
        id: "rpa-pilot",
        crewGroup: "PILOT",
        vendor: "IBS_ADOPT",
        dialect: "WEIGHTED",
        confidence: "CONFIRMED",
        config: {},
      },
    ],
  },
  {
    code: "BAD",
    name: "Bad Config Air",
    deployments: [
      {
        id: "bad-pilot",
        crewGroup: "PILOT",
        vendor: "NAVBLUE",
        dialect: "ORDERED_GROUPS",
        confidence: "CONFIRMED",
        config: { maxBidLines: "lots" },
      },
    ],
  },
];

/** In-memory pairing periods keyed by deployment, base and month. */
const periods = new Map<string, { importedAt: Date; pairings: Pairing[] }>();
const store: Store = {
  listAirlines: async () => airlines,
  findAirline: async (code) => airlines.find((a) => a.code === code) ?? null,
  loadPairings: async (id, base, month) => periods.get(`${id}|${base}|${month}`) ?? null,
  savePairings: async (id, base, month, pairings) => {
    periods.set(`${id}|${base}|${month}`, {
      importedAt: new Date("2026-09-20T12:00:00Z"),
      pairings,
    });
  },
};

/** Stands in for the Anthropic-backed parser; parse.test.ts covers the real one. */
const parser: Parser = async ({ text }) => {
  if (text === "refuse") throw new ParserError("refused");
  if (text === "vague") return { preferences: null, questions: ["Which days do you want off?"] };
  return {
    preferences: BidPreferences.parse({
      daysOff: { ranges: [{ start: "2026-10-10", end: "2026-10-12" }] },
      priorities: ["daysOff"],
    }),
    questions: ["Any trip length preference?"],
  };
};

const app = await buildApp({ store, parser });

const intent = {
  airline: "eny",
  crewGroup: "PILOT",
  month: "2026-10",
  base: "DFW",
  daysOff: { dates: ["2026-10-10"] },
  priorities: ["daysOff"],
};
const post = (payload: object) => app.inject({ method: "POST", url: "/bids/compile", payload });

describe("POST /bids/compile", () => {
  it("compiles with the deployment's vendor and flags an unconfirmed vendor mapping", async () => {
    const res = await post(intent);
    expect(res.statusCode).toBe(200);
    const bid = res.json<CompiledBid>();
    expect(bid.groups[0]!.lines.map((l) => l.text)).toEqual([
      "Start Pairings",
      "Prefer Off Oct 10, 2026",
      "Award Pairings",
    ]);
    expect(bid.warnings).toEqual([
      "Envoy Air pilots on NAVBLUE: from a third-party source, not confirmed by the airline or union. Check your bid screen matches before entering.",
    ]);
  });

  it("applies the deployment's config", async () => {
    const res = await post({ ...intent, crewGroup: "FLIGHT_ATTENDANT" });
    expect(res.statusCode).toBe(200);
    expect(res.json<CompiledBid>().groups[0]!.lines[0]!.text).toBe("Pairing Bid Group");
  });

  it("400 on an invalid intent", async () => {
    const res = await post({ ...intent, month: "2026-13", priorities: [] });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_intent");
    expect(res.json().issues.map((i: { path: string[] }) => i.path.join("."))).toEqual([
      "month",
      "priorities",
    ]);
  });

  it("404 on an unknown airline or a crew group with no PBS", async () => {
    expect((await post({ ...intent, airline: "ZZZ" })).json()).toEqual({
      error: "unknown_airline",
      airline: "ZZZ",
    });
    const res = await post({ ...intent, airline: "UAL", crewGroup: "FLIGHT_ATTENDANT" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("no_pbs_deployment");
  });

  it("compiles through the deployment's own compiler", async () => {
    const res = await post({ ...intent, airline: "UAL" });
    expect(res.statusCode).toBe(200);
    expect(res.json<CompileResponse>()).toMatchObject({
      vendor: "JEPPESEN",
      dialect: "ORDERED_GROUPS",
    });
  });

  it("501 when the vendor has no compiler yet", async () => {
    const res = await post({ ...intent, airline: "RPA" });
    expect(res.statusCode).toBe(501);
    expect(res.json()).toMatchObject({ error: "not_implemented", vendor: "IBS_ADOPT" });
  });

  it("500 when the stored deployment config is malformed", async () => {
    expect((await post({ ...intent, airline: "BAD" })).statusCode).toBe(500);
  });
});

describe("POST /bids/parse", () => {
  const context = { airline: "ENY", crewGroup: "PILOT", month: "2026-10", base: "DFW" };
  const parse = (payload: object, target = app) =>
    target.inject({ method: "POST", url: "/bids/parse", payload });

  it("returns a draft intent with the form's context and the parser's questions", async () => {
    const res = await parse({ text: "Off the 10th through 12th", context });
    expect(res.statusCode).toBe(200);
    const body = res.json<ParseResponse>();
    expect(body.intent).toMatchObject({
      ...context,
      lineType: "LINEHOLDER",
      daysOff: { ranges: [{ start: "2026-10-10", end: "2026-10-12" }] },
      priorities: ["daysOff"],
    });
    expect(body.questions).toEqual(["Any trip length preference?"]);
  });

  it("passes questions through when the parser couldn't fill anything", async () => {
    const res = await parse({ text: "vague", context });
    expect(res.json()).toEqual({ intent: null, questions: ["Which days do you want off?"] });
  });

  it("400 on a bad request, 502 when the parser fails, 503 when it isn't configured", async () => {
    expect((await parse({ text: "  ", context })).statusCode).toBe(400);
    const failed = await parse({ text: "refuse", context });
    expect(failed.statusCode).toBe(502);
    expect(failed.json()).toEqual({ error: "parser_failed", reason: "refused" });
    const unconfigured = await parse({ text: "Off the 10th", context }, await buildApp({ store }));
    expect(unconfigured.statusCode).toBe(503);
    expect(unconfigured.json().error).toBe("parser_not_configured");
  });
});

describe("POST /bid-periods/import", () => {
  const request = { airline: "eny", crewGroup: "PILOT", base: "dfw", month: "2026-10" };
  const csv = [
    "pairing,start_date,days,credit,report,layovers",
    "D101,2026-10-09,3,16:42,07:00,ORD",
    "D102,2026-10-14,3,15:10,09:00,AUS",
    "D103,2026-10-15,3,oops,06:30,",
  ].join("\n");
  const importFile = (payload: object) =>
    app.inject({ method: "POST", url: "/bid-periods/import", payload });

  it("stores valid pairings, reports bad rows, and feeds pool counts into /bids/compile", async () => {
    const res = await importFile({ ...request, format: "holdline-csv", data: csv });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      imported: 2,
      errors: [{ line: 4, message: "creditMinutes: Invalid input: expected number, received NaN" }],
    });

    const bid = (
      await post({ ...intent, daysOff: { dates: ["2026-10-10"] } })
    ).json<CompileResponse>();
    expect(bid.preview).toEqual({
      pairings: 2,
      importedAt: "2026-09-20T12:00:00.000Z",
      groups: [
        {
          lines: [
            null,
            { matched: 1, poolAfter: 1, unknown: 0 },
            { matched: 1, poolAfter: 1, unknown: 0 },
          ],
        },
      ],
    });

    const reserve = await post({ ...intent, lineType: "RESERVE" });
    expect(reserve.json<CompileResponse>().preview).toBeNull();
  });

  it("422 when nothing in the file is usable, 404 for an unknown airline, 400 for a bad format", async () => {
    const empty = await importFile({ ...request, format: "holdline-csv", data: "pairing\n" });
    expect(empty.statusCode).toBe(422);
    expect(empty.json().error).toBe("no_pairings");
    expect(
      (await importFile({ ...request, airline: "ZZZ", format: "holdline-csv", data: csv }))
        .statusCode,
    ).toBe(404);
    expect((await importFile({ ...request, format: "pdf", data: csv })).statusCode).toBe(400);
  });
});

describe("GET /airlines", () => {
  it("says which deployments Holdline can compile", async () => {
    const res = await app.inject({ method: "GET", url: "/airlines" });
    const rows =
      res.json<{ code: string; deployments: { vendor: string; compilable: boolean }[] }[]>();
    expect(rows.find((a) => a.code === "UAL")!.deployments[0]).toMatchObject({ compilable: true });
    expect(rows.find((a) => a.code === "RPA")!.deployments[0]).toMatchObject({ compilable: false });
  });
});
