import {
  PREFERENCE_NAMES,
  PreferenceKey,
  hasPreference,
  type BidIntent,
  type CompiledBid,
  type CompiledLine,
  type DeploymentConfig,
  type PairingMatch,
} from "@holdline/types";
import { daysOffInMonth } from "../../days-off.js";
import { WEEKDAY_NAMES, datesBetween, monthBounds, shortDate } from "../../format.js";
import { resolvePriorities } from "../../relax.js";
import { weightedLabels, type WeightedLabels } from "./labels.js";

/*
 * IBS / AD OPT scores pairings instead of reading bid lines in order: Desire bids add points when
 * granted, Avoid bids subtract when assigned, and the solver maximizes the total (EDV_AFA). So
 * priority becomes points: the most important preference gets the top of the scale, the rest step
 * down. Points are per granted item, so a weekday desire is split across its occurrences in the
 * month; otherwise four Wednesdays at 300 outweigh one 800-point date (EDV_AFA's own warning).
 */

const TOP_POINTS = 1000;
const LONGEST_PAIRING_DAYS = 6;
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;

interface Ctx {
  intent: BidIntent;
  L: WeightedLabels;
  warn: (message: string) => void;
}

/** One bid option; `budget` is the preference's share of the scale, set after ranking. */
type Draft = {
  kind: CompiledLine["kind"];
  option: string;
  value: string;
  /** Fraction of the preference's budget, e.g. 1/4 for one of four Wednesdays. */
  share: number;
  match?: PairingMatch;
};

const round = (n: number) => Math.max(1, Math.round(n));

const BUILDERS: Partial<Record<PreferenceKey, (c: Ctx) => Draft[]>> = {
  daysOff(c) {
    const { L, intent } = c;
    const off = daysOffInMonth(intent, c.warn);
    const out: Draft[] = [];
    // Specific dates keep their order: each later date is worth a little less.
    const dates = [
      ...new Set([...off.dates, ...off.ranges.flatMap((r) => datesBetween(r.start, r.end))]),
    ];
    dates.forEach((d, i) =>
      out.push({
        kind: "PREFER_OFF",
        option: L("opt.dateOff"),
        value: shortDate(d),
        share: 1 - i * 0.05,
        match: { type: "worksOn", dates: [d] },
      }),
    );
    const { first, last } = monthBounds(intent.month);
    const month = datesBetween(first, last);
    for (const day of off.daysOfWeek) {
      const occurrences = month.filter(
        (d) => WEEKDAYS[new Date(`${d}T00:00:00Z`).getUTCDay()] === day,
      ).length;
      out.push({
        kind: "PREFER_OFF",
        option: L("opt.daysOff"),
        value: WEEKDAY_NAMES[day],
        share: 1 / occurrences,
        match: { type: "worksOnWeekday", days: [day] },
      });
    }
    if (off.weekends) {
      const weekends = month.filter((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 6).length;
      out.push({
        kind: "PREFER_OFF",
        option: L("opt.weekendsOff"),
        value: "",
        share: 1 / weekends,
        match: { type: "worksWeekend" },
      });
    }
    return out;
  },
  pairingLength(c) {
    const len = c.intent.pairings.lengthDays;
    if (!len) return [];
    const { L } = c;
    const out: Draft[] = [];
    for (let n = len.min; n <= len.max; n++) {
      out.push({
        kind: "AWARD",
        option: L("opt.lengthIs"),
        value: `${n} day${n === 1 ? "" : "s"}`,
        share: 1,
        match: { type: "lengthIs", days: n },
      });
    }
    if (len.max < LONGEST_PAIRING_DAYS) {
      out.push({
        kind: "AVOID",
        option: L("opt.lengthAbove"),
        value: `${len.max} day${len.max === 1 ? "" : "s"}`,
        share: 1,
        match: { type: "lengthAbove", days: len.max },
      });
    }
    return out;
  },
  workBlocks(c) {
    const { maxDaysOn, minDaysOffInARow, commutable } = c.intent.line;
    if (minDaysOffInARow !== undefined || commutable) {
      c.warn(
        "Skipped days-off-in-a-row and commuting limits: no documented IBS option for them yet.",
      );
    }
    return maxDaysOn === undefined
      ? []
      : [
          {
            kind: "AVOID",
            option: c.L("opt.workingDaysAbove"),
            value: String(maxDaysOn),
            share: 1,
          },
        ];
  },
};

/** Preferences with no documented IBS option yet. */
const UNWRITTEN: Partial<Record<PreferenceKey, string>> = {
  reportRelease: "report and release times",
  layovers: "layovers",
  specificPairings: "specific pairings",
  credit: "credit range",
};

export function compileWeighted(intent: BidIntent, config: DeploymentConfig = {}): CompiledBid {
  const warnings: string[] = [];
  const c: Ctx = { intent, L: weightedLabels(config.labels), warn: (m) => warnings.push(m) };
  const result = (groups: CompiledBid["groups"]): CompiledBid => ({
    vendor: "IBS_ADOPT",
    dialect: "WEIGHTED",
    groups,
    warnings,
    syntaxVerified: false,
  });

  if (intent.lineType === "RESERVE") {
    c.warn(
      "Holdline can't write IBS reserve bids yet; reserve choices are on the Other Options tab.",
    );
    return result([]);
  }

  const built = new Map<PreferenceKey, Draft[]>();
  for (const key of PreferenceKey.options) {
    const builder = BUILDERS[key];
    if (!builder) {
      if (hasPreference(intent, key)) {
        c.warn(
          `Skipped ${UNWRITTEN[key] ?? PREFERENCE_NAMES[key]}: no documented IBS option for it yet.`,
        );
      }
      continue;
    }
    const drafts = builder(c);
    if (drafts.length) built.set(key, drafts);
  }
  const p = intent.pairings;
  if (
    p.avoidRedeyes ||
    p.avoidDeadheads ||
    p.maxLegsPerDuty !== undefined ||
    intent.waivers.length
  ) {
    c.warn(
      "Skipped red-eye, deadhead, legs-per-duty limits and waivers: no documented IBS option for them yet.",
    );
  }

  const { order, unranked } = resolvePriorities(intent.priorities, [...built.keys()]);
  if (unranked.length) {
    c.warn(
      `Ranked last because they're missing from your priorities: ${unranked.map((k) => PREFERENCE_NAMES[k]).join(", ")}.`,
    );
  }

  // Rank 1 gets 1000, the last gets 1000/n, evenly stepped: distinct, never all at the top.
  const lines: CompiledLine[] = order.flatMap((key, rank) => {
    const budget = (TOP_POINTS * (order.length - rank)) / order.length;
    return built.get(key)!.map((d) => {
      const points = round(budget * d.share);
      const label = d.value ? `${d.option} ${d.value}` : d.option;
      const line: CompiledLine = {
        kind: d.kind,
        text: `${label} (${points} ${c.L("points")})`,
        uiPath: ["Add a bid", d.option, ...(d.value ? [d.value] : []), `Points: ${points}`],
        preference: key,
        effect: "prefer",
      };
      if (d.match) line.match = d.match;
      return line;
    });
  });

  return result(lines.length ? [{ label: c.L("group.preferences"), relaxed: [], lines }] : []);
}
