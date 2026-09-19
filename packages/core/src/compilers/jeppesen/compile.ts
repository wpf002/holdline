import {
  PREFERENCE_NAMES,
  PreferenceKey,
  hasPreference,
  type BidIntent,
  type CompiledBid,
  type CompiledLine,
  type DeploymentConfig,
} from "@holdline/types";
import { allDaysOff, daysOffInMonth, toRuns } from "../../days-off.js";
import { resolvePriorities, relaxationSteps } from "../../relax.js";
import { jeppesenLabels, type JeppesenLabels } from "./labels.js";

/*
 * Jeppesen processes bid groups in order and moves to the next group when one can't produce a
 * line, so relaxation is one group per step from relax.ts: each group drops the least important
 * remaining preference, and the last keeps only hard limits (docs/pbs-research.md). United allows
 * up to 20 groups.
 */

const MAX_GROUPS = 20;
const LONGEST_PAIRING_DAYS = 6;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-07" -> "07 Oct", the date form in "AVOID Work 07 Apr -- 17 Apr". */
function day(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d} ${MONTHS[Number(m) - 1]}`;
}

interface Ctx {
  intent: BidIntent;
  L: JeppesenLabels;
  warn: (message: string) => void;
}
type Part = { negatives: CompiledLine[]; awards: CompiledLine[] };
const EMPTY: Part = { negatives: [], awards: [] };

function statement(
  kind: "AWARD" | "AVOID" | "WAIVE",
  text: string,
  extra: Pick<CompiledLine, "preference" | "match"> = {},
): CompiledLine {
  const out: CompiledLine = { kind, text, uiPath: ["Add a bid statement", text] };
  if (extra.preference) out.preference = extra.preference;
  if (extra.match) out.match = extra.match;
  return out;
}

const BUILDERS: Partial<Record<PreferenceKey, (c: Ctx) => Part>> = {
  daysOff(c) {
    const { L, intent } = c;
    // No floating days off in Jeppesen: every day off is a dated AVOID Work window.
    const dates = allDaysOff(daysOffInMonth(intent, c.warn), intent.month);
    return {
      negatives: toRuns(dates).map(({ start, end }) =>
        statement(
          "AVOID",
          `${L("stmt.avoid")} ${L("crit.work")} ${day(start)} ${L("range.to")} ${day(end)}`,
          {
            preference: "daysOff",
            match: { type: "worksOn", dates: dates.filter((d) => d >= start && d <= end) },
          },
        ),
      ),
      awards: [],
    };
  },
  pairingLength(c) {
    const len = c.intent.pairings.lengthDays;
    if (!len) return EMPTY;
    const { L } = c;
    const excluded = Array.from({ length: LONGEST_PAIRING_DAYS }, (_, i) => i + 1).filter(
      (n) => n < len.min || n > len.max,
    );
    return {
      negatives: excluded.map((n) =>
        statement("AVOID", `${L("stmt.avoid")} ${L("crit.pairingLength")} ${n}`, {
          preference: "pairingLength",
          match: { type: "lengthIs", days: n },
        }),
      ),
      awards: [],
    };
  },
  layovers(c) {
    const { L } = c;
    const up = (xs: string[]) => [...new Set(xs.map((x) => x.toUpperCase()))];
    const avoided = up(c.intent.pairings.avoidLayovers);
    const wanted = up(c.intent.pairings.preferLayovers).filter((s) => !avoided.includes(s));
    const crit = `${L("crit.layover")}`;
    return {
      negatives: avoided.map((s) =>
        statement("AVOID", `${L("stmt.avoid")} ${crit} ${s}`, {
          preference: "layovers",
          match: { type: "layoverIn", stations: [s] },
        }),
      ),
      awards: wanted.map((s) =>
        statement("AWARD", `${L("stmt.award")} ${crit} ${s} ${L("priority.high")}`, {
          preference: "layovers",
          match: { type: "layoverIn", stations: [s] },
        }),
      ),
    };
  },
};

/** Preferences with no documented Jeppesen statement yet. */
const UNWRITTEN: Partial<Record<PreferenceKey, string>> = {
  reportRelease: "report and release times",
  specificPairings: "specific pairings",
  credit: "credit range",
  workBlocks: "work-block limits",
};

export function compileJeppesen(intent: BidIntent, config: DeploymentConfig = {}): CompiledBid {
  const warnings: string[] = [];
  const c: Ctx = { intent, L: jeppesenLabels(config.labels), warn: (m) => warnings.push(m) };
  const result = (groups: CompiledBid["groups"]): CompiledBid => ({
    vendor: "JEPPESEN",
    dialect: "ORDERED_GROUPS",
    groups,
    warnings,
    syntaxVerified: false,
  });

  if (intent.lineType === "RESERVE") {
    c.warn("Holdline can't write Jeppesen reserve bids yet.");
    return result([]);
  }

  const built = new Map<PreferenceKey, Part>();
  for (const key of PreferenceKey.options) {
    const builder = BUILDERS[key];
    if (!builder) {
      if (hasPreference(intent, key)) {
        c.warn(
          `Skipped ${UNWRITTEN[key] ?? PREFERENCE_NAMES[key]}: Holdline doesn't have United's wording for it yet.`,
        );
      }
      continue;
    }
    const part = builder(c);
    if (part.negatives.length + part.awards.length > 0) built.set(key, part);
  }
  const p = intent.pairings;
  if (p.avoidRedeyes || p.avoidDeadheads || p.maxLegsPerDuty !== undefined) {
    c.warn(
      "Skipped red-eye, deadhead and legs-per-duty limits: Holdline doesn't have United's wording for them yet.",
    );
  }

  const waives: CompiledLine[] = [];
  for (const key of new Set(intent.waivers)) {
    const text = c.L.waiver(key);
    if (text === undefined)
      c.warn(`Skipped waiver "${key}": Holdline doesn't have United's wording for it yet.`);
    else waives.push(statement("WAIVE", `${c.L("stmt.waive")} ${text}`));
  }

  const { order, unranked } = resolvePriorities(intent.priorities, [...built.keys()]);
  if (unranked.length) {
    c.warn(
      `Ranked last because they're missing from your priorities: ${unranked.map((k) => PREFERENCE_NAMES[k]).join(", ")}.`,
    );
  }
  const { steps, skipped } = relaxationSteps(order, config.maxGroups ?? MAX_GROUPS);
  if (skipped.length)
    c.warn(
      `Used ${steps.length} bid groups, the most this airline allows; skipped ${skipped.length} relaxation steps.`,
    );

  return result(
    steps.map((step, i) => {
      const label = `${c.L("group.header")} ${i + 1}`;
      return {
        label,
        relaxed: step.dropped,
        lines: [
          { kind: "SYSTEM" as const, text: label, uiPath: ["Add a bid group"] },
          ...waives,
          ...step.keep.flatMap((k) => built.get(k)!.negatives),
          ...step.keep.flatMap((k) => built.get(k)!.awards),
        ],
      };
    }),
  );
}
