import {
  PREFERENCE_NAMES,
  PreferenceKey,
  hasPreference,
  type BidIntent,
  type CompiledBid,
  type CompiledGroup,
  type CompiledLine,
  type DeploymentConfig,
  type PairingMatch,
} from "@holdline/types";
import {
  WEEKDAY_NAMES,
  datesBetween,
  hours,
  longDate,
  monthBounds,
  monthDay,
  monthName,
  shortDate,
} from "../../format.js";
import { daysOffInMonth } from "../../days-off.js";
import { resolvePriorities } from "../../relax.js";
import { navblueLabels, type NavblueLabels } from "./labels.js";

/*
 * How NAVBLUE relaxes a bid (AC_GUIDE p.4-4 and 4-11, KB_PROCESSING, KB_DENIAL in labels.ts):
 * - Set Condition, Prefer Off and Avoid lines are honored 100% inside a bid group.
 * - If no block can be built, Denial Mode deletes them from the bottom of the group up and restarts
 *   the award each time. Prefer Off lists lose dates right to left.
 * - PBS moves to the next bid group only through Else Start Next Bid Group or Clear Schedule and
 *   Start Next Bid Group, and both discard what was awarded so far.
 * So the relaxation order is line order inside one group: the most important negatives go on top,
 * where Denial Mode reaches them last. One group per relaxation step would leave groups 2..N
 * unreachable, and wiring them up with Else Start Next Bid Group loses the partial days off that
 * Denial Mode keeps.
 */

type Part = { negatives: CompiledLine[]; awards: CompiledLine[] };
const EMPTY: Part = { negatives: [], awards: [] };

interface Ctx {
  intent: BidIntent;
  config: DeploymentConfig;
  L: NavblueLabels;
  warn: (message: string) => void;
}

/** BidIntent caps pairings.lengthDays.max at 6, so "max 6" needs no line. */
const LONGEST_PAIRING_DAYS = 6;
/** A reserve group takes Prefer Off, Set Condition and Waive lines only (KB_CATALOG). */
const RESERVE_KEYS = new Set<PreferenceKey>(["daysOff", "workBlocks"]);
const RESERVE_ONLY_WAIVERS = new Set(["max-5-day-workblock"]);

const BUILDERS: Record<PreferenceKey, (c: Ctx) => Part> = {
  daysOff,
  pairingLength,
  reportRelease,
  layovers,
  specificPairings,
  credit,
  workBlocks,
};

export function compileNavblue(intent: BidIntent, config: DeploymentConfig = {}): CompiledBid {
  const warnings: string[] = [];
  const c: Ctx = { intent, config, L: navblueLabels(config.labels), warn: (m) => warnings.push(m) };
  const reserve = intent.lineType === "RESERVE";

  const built = new Map<PreferenceKey, Part>();
  for (const key of PreferenceKey.options) {
    if (reserve && !RESERVE_KEYS.has(key)) {
      if (hasPreference(intent, key)) {
        c.warn(`Skipped ${PREFERENCE_NAMES[key]}: not available in a NAVBLUE reserve group.`);
      }
      continue;
    }
    const part = BUILDERS[key](c);
    if (part.negatives.length + part.awards.length > 0) built.set(key, part);
  }

  const { order, unranked } = resolvePriorities(intent.priorities, [...built.keys()]);
  if (unranked.length) {
    c.warn(
      `Ranked last because they're missing from your priorities: ${unranked.map((k) => PREFERENCE_NAMES[k]).join(", ")}.`,
    );
  }
  if (order.length === 0) c.warn("None of your preferences produced a bid line.");

  const negatives = order.flatMap((k) => built.get(k)!.negatives);
  const awards = order.flatMap((k) => built.get(k)!.awards);
  const waives = waivers(c, reserve);

  let groups: CompiledGroup[];
  if (reserve) {
    const p = intent.pairings;
    if (p.avoidRedeyes || p.avoidDeadheads || p.maxLegsPerDuty !== undefined) {
      c.warn(
        "Skipped red-eye, deadhead and legs-per-duty limits: not available in a NAVBLUE reserve group.",
      );
    }
    c.warn(
      "Reserve bidding depends on your airline's reserve setup. Check that Add Bid Group offers Start Reserve Bid before entering this.",
    );
    groups = reserveGroups(c, [...waives, ...negatives]);
  } else {
    // Waive lines always sit at the top of a group (AC_GUIDE p.5-62). Hard limits come next so Denial
    // Mode removes them last; Set Condition only has to be above every Award line (KB_MIN_DAYS_OFF).
    groups = [pairingGroup(c, [...waives, ...hardAvoids(c), ...negatives, ...awards])];
  }

  // Every line is numbered except the embedded Award Pairings at the end of a pairing group (AC_GUIDE p.4-13).
  const numbered = groups.reduce((n, g) => n + g.lines.length, 0) - (reserve ? 0 : 1);
  if (config.maxBidLines !== undefined && numbered > config.maxBidLines) {
    c.warn(`This bid has ${numbered} lines; ${intent.airline} accepts ${config.maxBidLines}.`);
  }

  return { vendor: "NAVBLUE", dialect: "ORDERED_GROUPS", groups, warnings, syntaxVerified: false };
}

// ── Line helpers ──────────────────────────────────────────────────────

function line(
  kind: CompiledLine["kind"],
  text: string,
  uiPath: string[],
  extra: { preference?: PreferenceKey; match?: PairingMatch } = {},
): CompiledLine {
  const out: CompiledLine = { kind, text, uiPath };
  if (extra.preference) out.preference = extra.preference;
  if (extra.match) out.match = extra.match;
  return out;
}

function avoid(
  c: Ctx,
  criteria: string,
  steps: string[],
  match: PairingMatch,
  preference?: PreferenceKey,
): CompiledLine {
  const { L } = c;
  return line("AVOID", `${L("line.avoid")} ${criteria}`, [L("ui.avoid"), ...steps, L("ui.apply")], {
    preference,
    match,
  });
}

function award(
  c: Ctx,
  criteria: string,
  steps: string[],
  match: PairingMatch,
  preference: PreferenceKey,
): CompiledLine {
  const { L } = c;
  return line("AWARD", `${L("line.award")} ${criteria}`, [L("ui.award"), ...steps, L("ui.apply")], {
    preference,
    match,
  });
}

function setCondition(
  c: Ctx,
  condition: string,
  value: string | undefined,
  preference: PreferenceKey,
): CompiledLine {
  const { L } = c;
  const text =
    value === undefined
      ? `${L("line.set")} ${condition}`
      : `${L("line.set")} ${condition} ${value}`;
  const steps = value === undefined ? [condition] : [condition, `Enter ${value}`];
  return line("SET", text, [L("ui.set"), ...steps, L("ui.apply")], { preference });
}

// ── Groups ────────────────────────────────────────────────────────────

function addGroupPath(c: Ctx, option: string): string[] {
  const { L } = c;
  return [L("ui.bids"), L("ui.bidType"), L("ui.addGroup"), option, L("ui.apply")];
}

function pairingGroup(c: Ctx, lines: CompiledLine[]): CompiledGroup {
  const { L } = c;
  return {
    label: "Bid Group 1",
    relaxed: [],
    lines: [
      line("SYSTEM", L("group.pairings"), addGroupPath(c, L("ui.pairingGroup"))),
      ...lines,
      line("SYSTEM", L("group.pairings.end"), [], { match: { type: "any" } }),
    ],
  };
}

/** Start Reserve Bid sends PBS straight to the first Start Reserve group (AC_GUIDE p.4-11, 5-48). */
function reserveGroups(c: Ctx, lines: CompiledLine[]): CompiledGroup[] {
  const { L } = c;
  return [
    {
      label: "Bid Group 1",
      relaxed: [],
      lines: [line("SYSTEM", L("group.reserveJump"), addGroupPath(c, L("group.reserveJump")))],
    },
    {
      label: "Bid Group 2",
      relaxed: [],
      lines: [line("SYSTEM", L("group.reserve"), addGroupPath(c, L("group.reserve"))), ...lines],
    },
  ];
}

// ── Hard constraints: never relaxed by Holdline, removed last by Denial Mode ──

function waivers(c: Ctx, reserve: boolean): CompiledLine[] {
  const { L } = c;
  const out: CompiledLine[] = [];
  for (const key of new Set(c.intent.waivers)) {
    const text = L.waiver(key);
    if (text === undefined) {
      c.warn(`Skipped waiver "${key}": not available in NAVBLUE.`);
    } else if (RESERVE_ONLY_WAIVERS.has(key) && !reserve) {
      c.warn(`Skipped waiver "${key}": reserve bids only.`);
    } else {
      out.push(line("WAIVE", `${L("line.waive")} ${text}`, [L("ui.waive"), text, L("ui.apply")]));
    }
  }
  return out;
}

function hardAvoids(c: Ctx): CompiledLine[] {
  const { L } = c;
  const p = c.intent.pairings;
  const out: CompiledLine[] = [];
  if (p.avoidRedeyes) {
    out.push(avoid(c, L("crit.redeye"), [L("ui.redeyes"), "Any"], { type: "redeye" }));
  }
  if (p.avoidDeadheads) {
    out.push(
      avoid(
        c,
        `${L("crit.deadheadLegs")} > 0 ${L("unit.legs")}`,
        [L("crit.deadheadLegs"), L("ui.greaterThan"), "0"],
        { type: "deadhead" },
      ),
    );
  }
  if (p.maxLegsPerDuty !== undefined) {
    const n = String(p.maxLegsPerDuty);
    out.push(
      avoid(
        c,
        `${L("crit.dutyLegs")} > ${n} ${L("unit.legs")}`,
        [L("crit.dutyLegs"), L("ui.greaterThan"), n],
        { type: "dutyLegsAbove", legs: p.maxLegsPerDuty },
      ),
    );
  }
  return out;
}

// ── Preferences ───────────────────────────────────────────────────────

/** Selection order is the priority order on a Prefer Off list (AC_GUIDE p.5-9). */
const clickInOrder = (items: string[]) =>
  items.length > 1 ? `Click ${items.join(", ")} in that order` : `Click ${items[0]}`;

function daysOff(c: Ctx): Part {
  const { L, intent } = c;
  const off = daysOffInMonth(intent, c.warn);
  const out: CompiledLine[] = [];
  const add = (text: string, steps: string[], match: PairingMatch) =>
    out.push(
      line(
        "PREFER_OFF",
        `${L("line.preferOff")} ${text}`,
        [L("ui.preferOff"), ...steps, L("ui.apply")],
        { preference: "daysOff", match },
      ),
    );

  if (off.dates.length) {
    add(
      off.dates.map(shortDate).join(", "),
      [L("ui.datesList"), clickInOrder(off.dates.map(monthDay))],
      { type: "worksOn", dates: off.dates },
    );
  }
  for (const { start, end } of off.ranges) {
    add(
      `${shortDate(start)} - ${shortDate(end)}`,
      [L("ui.datesRange"), `${monthDay(start)} to ${monthDay(end)}`],
      { type: "worksOn", dates: datesBetween(start, end) },
    );
  }
  const days = off.daysOfWeek.map((d) => WEEKDAY_NAMES[d]);
  if (days.length) {
    add(days.join(", "), [L("ui.daysOfWeekList"), clickInOrder(days)], {
      type: "worksOnWeekday",
      days: off.daysOfWeek,
    });
  }
  // A blank Minimum asks for as many weekends off as possible (AC_GUIDE p.5-14).
  if (off.weekends) {
    add(L("preferOff.weekends"), [L("preferOff.weekends"), "Leave Minimum blank"], {
      type: "worksWeekend",
    });
  }
  return { negatives: out, awards: [] };
}

/** Avoid lines rather than Award: negatives are what Denial Mode relaxes in priority order. */
function pairingLength(c: Ctx): Part {
  const len = c.intent.pairings.lengthDays;
  if (!len) return EMPTY;
  const { L } = c;
  const crit = L("crit.pairingLength");
  const out: CompiledLine[] = [];
  if (len.min > 1) {
    out.push(
      avoid(
        c,
        `${crit} < ${len.min} ${L("unit.days")}`,
        [crit, L("ui.lessThan"), String(len.min)],
        { type: "lengthBelow", days: len.min },
        "pairingLength",
      ),
    );
  }
  if (len.max < LONGEST_PAIRING_DAYS) {
    out.push(
      avoid(
        c,
        `${crit} > ${len.max} ${L("unit.days")}`,
        [crit, L("ui.greaterThan"), String(len.max)],
        { type: "lengthAbove", days: len.max },
        "pairingLength",
      ),
    );
  }
  return { negatives: out, awards: [] };
}

function reportRelease(c: Ctx): Part {
  const { L } = c;
  const { reportAfter, releaseBefore } = c.intent.pairings;
  const out: CompiledLine[] = [];
  if (reportAfter) {
    const steps = [L("crit.checkIn"), L("op.before"), reportAfter];
    out.push(
      avoid(
        c,
        `${L("crit.checkIn")} ${L("op.before")} ${reportAfter}`,
        steps,
        { type: "reportBefore", time: reportAfter },
        "reportRelease",
      ),
    );
  }
  if (releaseBefore) {
    const steps = [L("crit.checkOut"), L("op.after"), releaseBefore];
    out.push(
      avoid(
        c,
        `${L("crit.checkOut")} ${L("op.after")} ${releaseBefore}`,
        steps,
        { type: "releaseAfter", time: releaseBefore },
        "reportRelease",
      ),
    );
  }
  return { negatives: out, awards: [] };
}

function layovers(c: Ctx): Part {
  const { L } = c;
  const stations = (xs: string[]) => [...new Set(xs.map((x) => x.toUpperCase()))];
  const avoided = stations(c.intent.pairings.avoidLayovers);
  const preferred = stations(c.intent.pairings.preferLayovers);
  const both = preferred.filter((s) => avoided.includes(s));
  if (both.length)
    c.warn(`${both.join(", ")} listed as both preferred and avoided layovers; avoiding.`);
  const wanted = preferred.filter((s) => !avoided.includes(s));
  const crit = (list: string[]) => `${L("crit.layoverIn")} ${list.join(", ")}`;
  const steps = (list: string[]) => [L("ui.layover"), `Select ${list.join(", ")}`];
  return {
    negatives: avoided.length
      ? [
          avoid(
            c,
            crit(avoided),
            steps(avoided),
            { type: "layoverIn", stations: avoided },
            "layovers",
          ),
        ]
      : [],
    awards: wanted.length
      ? [award(c, crit(wanted), steps(wanted), { type: "layoverIn", stations: wanted }, "layovers")]
      : [],
  };
}

/** Entered from the Pairings tab in Add Bids Mode (KB_PAIRING_ON_DATE). */
function specificPairings(c: Ctx): Part {
  const { L, intent } = c;
  const { first, last } = monthBounds(intent.month);
  const awards: CompiledLine[] = [];
  for (const p of intent.pairings.specific) {
    if (p.date < first || p.date > last) {
      c.warn(
        `Skipped pairing ${p.number} on ${shortDate(p.date)}: outside the ${monthName(intent.month)} bid period.`,
      );
      continue;
    }
    // Criteria after the first are chained with " If " (KB_SAMPLE_1, AC_GUIDE p.4-6).
    const text = `${L("line.award")} ${L("crit.departingOn")} ${longDate(p.date)} If ${L("crit.pairingNumber")} ${p.number}`;
    const uiPath = [
      L("ui.pairingsTab"),
      L("ui.addBidsMode"),
      `Pairing ${p.number}`,
      monthDay(p.date),
      "Award",
    ];
    awards.push(
      line("AWARD", text, uiPath, {
        preference: "specificPairings",
        match: { type: "pairingOn", number: p.number, date: p.date },
      }),
    );
  }
  return { negatives: [], awards };
}

/**
 * NAVBLUE takes no hours: Set Condition Minimum Credit Window stops adding pairings once past the
 * minimum, Maximum Credit Window builds close to the maximum, and no condition means the normal
 * window (ENVOY_AFA p.31, AC_GUIDE p.5-55). Map the requested range onto the airline's windows.
 */
function credit(c: Ctx): Part {
  const want = c.intent.line.creditMinutes;
  if (!want) return EMPTY;
  const { L } = c;
  const asked = `Credit ${hours(want.min)}-${hours(want.max)}`;
  const w = c.config.creditWindows;
  if (!w) {
    c.warn(
      `${asked}: NAVBLUE doesn't take a credit range. It offers Set Condition Minimum Credit Window (stop adding pairings once past the minimum) and Maximum Credit Window (build close to the maximum). Holdline doesn't have ${c.intent.airline}'s credit windows yet, so no credit line was added.`,
    );
    return EMPTY;
  }
  if (w.minimum && want.max < w.normal.min) {
    return {
      negatives: [setCondition(c, L("set.minCreditWindow"), undefined, "credit")],
      awards: [],
    };
  }
  if (w.maximum && want.min > w.normal.max) {
    return {
      negatives: [setCondition(c, L("set.maxCreditWindow"), undefined, "credit")],
      awards: [],
    };
  }
  if (want.min > w.normal.min || want.max < w.normal.max) {
    c.warn(
      `${asked}: NAVBLUE can't target that range. With no credit Set Condition, PBS builds in the normal window (${hours(w.normal.min)}-${hours(w.normal.max)}).`,
    );
  }
  return EMPTY;
}

function workBlocks(c: Ctx): Part {
  const { L } = c;
  const { maxDaysOn, minDaysOffInARow, commutable } = c.intent.line;
  const out: CompiledLine[] = [];
  if (maxDaysOn !== undefined)
    out.push(setCondition(c, L("set.maxDaysOn"), String(maxDaysOn), "workBlocks"));
  if (minDaysOffInARow !== undefined) {
    out.push(setCondition(c, L("set.minDaysOffInARow"), String(minDaysOffInARow), "workBlocks"));
  }
  if (commutable) {
    c.warn(
      "Skipped commutable: NAVBLUE has no commutable-line condition. Report and release times do that job.",
    );
  }
  return { negatives: out, awards: [] };
}
