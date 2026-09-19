import type { CompiledBid } from "@holdline/types";
import { describe, expect, it } from "vitest";
import { buildApp, type AirlineRecord } from "./app.js";

const airlines: AirlineRecord[] = [
  {
    code: "ENY",
    name: "Envoy Air",
    deployments: [
      { crewGroup: "PILOT", vendor: "NAVBLUE", confidence: "THIRD_PARTY", config: {} },
      {
        crewGroup: "FLIGHT_ATTENDANT",
        vendor: "NAVBLUE",
        confidence: "CONFIRMED",
        config: { labels: { "group.pairings": "Pairing Bid Group" } },
      },
    ],
  },
  {
    code: "UAL",
    name: "United Airlines",
    deployments: [{ crewGroup: "PILOT", vendor: "JEPPESEN", confidence: "CONFIRMED", config: {} }],
  },
  {
    code: "BAD",
    name: "Bad Config Air",
    deployments: [
      {
        crewGroup: "PILOT",
        vendor: "NAVBLUE",
        confidence: "CONFIRMED",
        config: { maxBidLines: "lots" },
      },
    ],
  },
];

const app = await buildApp({
  listAirlines: async () => airlines,
  findAirline: async (code) => airlines.find((a) => a.code === code) ?? null,
});

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

  it("501 when the vendor has no compiler yet", async () => {
    const res = await post({ ...intent, airline: "UAL" });
    expect(res.statusCode).toBe(501);
    expect(res.json()).toMatchObject({ error: "not_implemented", vendor: "JEPPESEN" });
  });

  it("500 when the stored deployment config is malformed", async () => {
    expect((await post({ ...intent, airline: "BAD" })).statusCode).toBe(500);
  });
});
