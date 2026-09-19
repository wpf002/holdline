import {
  PREFERENCE_NAMES,
  PreferenceKey,
  type BidIntent,
  type CompiledBid,
  type CompiledLine,
  type DeploymentConfig,
  type PairingMatch,
  type PbsVendor,
} from "@holdline/types";
import { daysOffInMonth } from "../../days-off.js";
import { WEEKDAY_NAMES, datesBetween, hours } from "../../format.js";
import { resolvePriorities, relaxationSteps } from "../../relax.js";
import { layeredLabels, type LayeredLabels } from "./labels.js";

/*
 * Layered PBS (American, SkyWest AOS): up to 7 layers, tried in order. Each layer lists the
 * properties that define it: "or" within a property, "and" across properties (AOS docs). Holdline
 * relaxes one preference per layer with relax.ts; the last layer keeps only hard limits.
 */

const DEFAULT_LAYERS = 7;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (iso: string) => `${Number(iso.slice(8))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

interface Ctx {
  intent: BidIntent;
  L: LayeredLabels;
  warn: (message: string) => void;
}

function property(
  c: Ctx,
  tab: "tab.daysOff" | "tab.pairing" | "tab.line",
  name: string,
  value: string | undefined,
  extra: Pick<CompiledLine, "preference" | "match" | "effect"> = {},
): CompiledLine {
  const text = value === undefined ? name : `${name}: ${value}`;
  const out: CompiledLine = {
    kind: "PROPERTY",
    text,
    uiPath: [`${c.L(tab)} tab`, name, ...(value === undefined ? [] : [value])],
  };
  if (extra.preference) out.preference = extra.preference;
  if (extra.match) out.match = extra.match;
  if (extra.effect) out.effect = extra.effect;
  return out;
}

const BUILDERS: Partial<Record<PreferenceKey, (c: Ctx) => CompiledLine[]>> = {
  daysOff(c) {
    const { L, intent } = c;
    const off = daysOffInMonth(intent, c.warn);
    const out: CompiledLine[] = [];
    const specific = [...off.dates, ...off.ranges.flatMap((r) => datesBetween(r.start, r.end))];
    const unique = [...new Set(specific)];
    if (unique.length) {
      out.push(
        property(c, "tab.daysOff", L("prop.daysOff"), unique.map(day).join(", "), {
          preference: "daysOff",
          match: { type: "worksOn", dates: unique },
          effect: "remove",
        }),
      );
    }
    if (off.daysOfWeek.length) {
      out.push(
        property(
          c,
          "tab.daysOff",
          L("prop.daysOfWeek"),
          off.daysOfWeek.map((d) => WEEKDAY_NAMES[d]).join(", "),
          {
            preference: "daysOff",
            match: { type: "worksOnWeekday", days: off.daysOfWeek },
            effect: "remove",
          },
        ),
      );
    }
    // A line property: PBS weighs weekends off across the line rather than filtering pairings.
    if (off.weekends)
      out.push(
        property(c, "tab.daysOff", L("prop.weekends"), undefined, { preference: "daysOff" }),
      );
    return out;
  },
  pairingLength(c) {
    const len = c.intent.pairings.lengthDays;
    if (!len) return [];
    const lengths = Array.from({ length: len.max - len.min + 1 }, (_, i) => String(len.min + i));
    return [
      property(c, "tab.pairing", c.L("prop.pairingLength"), lengths.join(", "), {
        preference: "pairingLength",
        match: { type: "lengthBetween", min: len.min, max: len.max },
        effect: "keep",
      }),
    ];
  },
  reportRelease(c) {
    const { reportAfter, releaseBefore } = c.intent.pairings;
    const out: CompiledLine[] = [];
    if (reportAfter) {
      out.push(
        property(c, "tab.pairing", c.L("prop.reportBetween"), `${reportAfter} and 23:59`, {
          preference: "reportRelease",
          match: { type: "reportBetween", from: reportAfter, to: "23:59" },
          effect: "keep",
        }),
      );
    }
    if (releaseBefore) {
      out.push(
        property(c, "tab.pairing", c.L("prop.releaseBetween"), `00:00 and ${releaseBefore}`, {
          preference: "reportRelease",
          match: { type: "releaseBetween", from: "00:00", to: releaseBefore },
          effect: "keep",
        }),
      );
    }
    return out;
  },
  layovers(c) {
    const up = (xs: string[]) => [...new Set(xs.map((x) => x.toUpperCase()))];
    const avoided = up(c.intent.pairings.avoidLayovers);
    const wanted = up(c.intent.pairings.preferLayovers).filter((s) => !avoided.includes(s));
    const out: CompiledLine[] = [];
    if (avoided.length) {
      out.push(
        property(c, "tab.pairing", c.L("prop.avoidLayoverAt"), avoided.join(", "), {
          preference: "layovers",
          match: { type: "layoverIn", stations: avoided },
          effect: "remove",
        }),
      );
    }
    if (wanted.length) {
      out.push(
        property(c, "tab.pairing", c.L("prop.layoverAt"), wanted.join(", "), {
          preference: "layovers",
          match: { type: "layoverIn", stations: wanted },
          effect: "keep",
        }),
      );
    }
    return out;
  },
  specificPairings(c) {
    return c.intent.pairings.specific.map((p) =>
      property(c, "tab.pairing", c.L("prop.pairingOnDate"), `${p.number} on ${day(p.date)}`, {
        preference: "specificPairings",
        match: { type: "pairingOn", number: p.number, date: p.date },
        effect: "prefer",
      }),
    );
  },
  credit(c) {
    const want = c.intent.line.creditMinutes;
    if (!want) return [];
    return [
      property(c, "tab.line", c.L("prop.creditRange"), `${hours(want.min)} - ${hours(want.max)}`, {
        preference: "credit",
      }),
    ];
  },
  workBlocks(c) {
    const { maxDaysOn, minDaysOffInARow, commutable } = c.intent.line;
    const out: CompiledLine[] = [];
    if (maxDaysOn !== undefined) {
      out.push(
        property(c, "tab.line", c.L("prop.workBlockSize"), `1 - ${maxDaysOn}`, {
          preference: "workBlocks",
        }),
      );
    }
    if (minDaysOffInARow !== undefined) {
      out.push(
        property(c, "tab.line", c.L("prop.minDaysOffBetween"), String(minDaysOffInARow), {
          preference: "workBlocks",
        }),
      );
    }
    if (commutable)
      out.push(
        property(c, "tab.line", c.L("prop.commutable"), undefined, { preference: "workBlocks" }),
      );
    return out;
  },
};

function hardLimits(c: Ctx): CompiledLine[] {
  const p = c.intent.pairings;
  const out: CompiledLine[] = [];
  if (p.avoidDeadheads) {
    out.push(
      property(c, "tab.pairing", c.L("prop.avoidDeadheads"), undefined, {
        match: { type: "deadhead" },
        effect: "remove",
      }),
    );
  }
  if (p.maxLegsPerDuty !== undefined) {
    const match: PairingMatch = { type: "dutyLegsAbove", legs: p.maxLegsPerDuty };
    out.push(
      property(c, "tab.pairing", c.L("prop.maxLandings"), String(p.maxLegsPerDuty), {
        match,
        effect: "remove",
      }),
    );
  }
  if (p.avoidRedeyes)
    c.warn("Skipped no red-eyes: Holdline doesn't have a layered PBS property for it yet.");
  return out;
}

export function compileLayered(
  intent: BidIntent,
  vendor: PbsVendor,
  config: DeploymentConfig = {},
): CompiledBid {
  const warnings: string[] = [];
  const c: Ctx = { intent, L: layeredLabels(config.labels), warn: (m) => warnings.push(m) };
  const result = (groups: CompiledBid["groups"]): CompiledBid => ({
    vendor,
    dialect: "LAYERED",
    groups,
    warnings,
    syntaxVerified: false,
  });

  if (intent.lineType === "RESERVE") {
    c.warn("Holdline can't write reserve bids for layered PBS yet.");
    return result([]);
  }

  const built = new Map<PreferenceKey, CompiledLine[]>();
  for (const key of PreferenceKey.options) {
    const lines = BUILDERS[key]!(c);
    if (lines.length) built.set(key, lines);
  }
  if (intent.waivers.length) {
    c.warn(
      `Skipped waivers (${intent.waivers.join(", ")}): Holdline doesn't map waivers to layered PBS yet.`,
    );
  }
  const hard = hardLimits(c);

  const { order, unranked } = resolvePriorities(intent.priorities, [...built.keys()]);
  if (unranked.length) {
    c.warn(
      `Ranked last because they're missing from your priorities: ${unranked.map((k) => PREFERENCE_NAMES[k]).join(", ")}.`,
    );
  }
  const { steps, skipped } = relaxationSteps(order, config.layers ?? DEFAULT_LAYERS);
  if (skipped.length) {
    c.warn(
      `Used all ${steps.length} layers; ${skipped.length} relaxation steps didn't fit, so layer ${steps.length} drops straight to your hard limits.`,
    );
  }

  const groups = steps.map((step, i) => ({
    label: `${c.L("layer")} ${i + 1}`,
    relaxed: step.dropped,
    lines: [...hard, ...step.keep.flatMap((k) => built.get(k)!)].map((line) => ({
      ...line,
      uiPath: [`${c.L("layer")} ${i + 1}`, ...line.uiPath],
    })),
  }));

  const total = groups.reduce((n, g) => n + g.lines.length, 0);
  if (config.maxBidLines !== undefined && total > config.maxBidLines) {
    c.warn(`This bid has ${total} bids; ${intent.airline} accepts ${config.maxBidLines} a month.`);
  }
  return result(groups);
}
