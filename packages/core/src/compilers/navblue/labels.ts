/**
 * Every piece of NAVBLUE N-PBS wording Holdline emits, with where it came from.
 *
 * None of this has been compared against a live bid screen for the first user's airline yet, so the
 * compiler reports syntaxVerified: false. Airline-specific wording goes in PbsDeployment.config.labels
 * under the same keys (see NavblueLabels).
 */

const KB = "https://n-crewplanning.support.navblue.aero/support/solutions/articles";

export const SOURCES = {
  KB_SAMPLE_1: `${KB}/35000205180 (NAVBLUE KB, Sample Bids - Scenario 1)`,
  KB_SAMPLE_2: `${KB}/35000205181 (NAVBLUE KB, Sample Bids - Scenario 2)`,
  KB_SAMPLE_4: `${KB}/35000205211 (NAVBLUE KB, Sample Bids - Scenario 4)`,
  KB_PROCESSING: `${KB}/35000204873 (NAVBLUE KB, How the PBS Scheduler Uses Your Pairing Bids)`,
  KB_DENIAL: `${KB}/35000204880 (NAVBLUE KB, Denial Mode)`,
  KB_CATALOG: `${KB}/35000317611 (NAVBLUE KB, Bid Options Catalog)`,
  KB_DAYS_OF_WEEK: `${KB}/35000210195 (NAVBLUE KB, Prefer Off Calendar - List of Dates)`,
  KB_WEEKENDS: `${KB}/35000210197 (NAVBLUE KB, Prefer Off Weekends)`,
  KB_MIN_DAYS_OFF: `${KB}/35000210444 (NAVBLUE KB, Minimum Days Off In A Row)`,
  KB_MIN_CREDIT: `${KB}/35000210443 (NAVBLUE KB, Minimum Credit Window)`,
  KB_MAX_CREDIT: `${KB}/35000210436 (NAVBLUE KB, Maximum Credit Window)`,
  KB_ANY_EVERY: `${KB}/35000204815 (NAVBLUE KB, Using Any or Every)`,
  KB_PAIRING_ON_DATE: `${KB}/35000201710 (NAVBLUE KB, Add a Pairing Number Departing on Date Bid from the Pairings Screen)`,
  KB_RESERVE_WAIVE: `${KB}/35000210224 (NAVBLUE KB, Waive Max 5 Day Workblock)`,
  KB_OPERATORS: `${KB}/35000210180 (NAVBLUE KB, Greater Than, Less Than, Equal To, and Range)`,
  AC_GUIDE:
    "https://accomponent.ca/wp-content/uploads/2021/02/PBS_Bidder_Guide_FINAL_Eng-Apr-2015.pdf (Air Canada PBS Bidder's Guide, 2015-04-10)",
  ENVOY_AFA:
    "https://afaeagle.com/system/files/2025-08/pbs_generic_basic_bid.pdf (Envoy AFA PBS Generic Basic Bid, 8/2025; Envoy NAVBLUE screenshots)",
} as const;

/** `source` names SOURCES keys, plus page numbers or the verbatim example the wording was taken from. */
type Label = { text: string; source: string };

export const LABELS = {
  // ── Groups ───────────────────────────────────────────────────────────
  "group.pairings": { text: "Start Pairings", source: "KB_SAMPLE_1; AC_GUIDE p.4-11" },
  "group.pairings.end": { text: "Award Pairings", source: "KB_PROCESSING; ENVOY_AFA p.34" },
  "group.reserveJump": { text: "Start Reserve Bid", source: "AC_GUIDE p.4-11, 5-48; KB_SAMPLE_2" },
  "group.reserve": { text: "Start Reserve", source: "AC_GUIDE p.4-11; KB_SAMPLE_2" },

  // ── Line types ───────────────────────────────────────────────────────
  "line.preferOff": { text: "Prefer Off", source: "KB_SAMPLE_1; AC_GUIDE p.5-11" },
  "line.avoid": { text: "Avoid Pairings If", source: "KB_SAMPLE_1" },
  "line.award": { text: "Award Pairings If", source: "KB_SAMPLE_1; ENVOY_AFA p.34" },
  "line.set": { text: "Set Condition", source: "ENVOY_AFA p.34" },
  "line.waive": { text: "Waive", source: "ENVOY_AFA p.34" },

  // ── Prefer Off ───────────────────────────────────────────────────────
  // Dates: "Prefer Off Jan 01, 2014, Jan 02, 2014" (AC p.5-11). Range: "Prefer Off Dec 14, 2011 - Dec 17, 2011" (KB_SAMPLE_1).
  // Days: "Prefer Off Friday, Saturday, Sunday" (KB_DAYS_OF_WEEK). Order = priority; Denial Mode drops right to left.
  "preferOff.weekends": { text: "Weekends", source: "KB_WEEKENDS; AC_GUIDE p.5-14" },

  // ── Award / Avoid criteria ───────────────────────────────────────────
  "crit.layoverIn": {
    text: "Layover In",
    source: 'KB_SAMPLE_1; KB_SAMPLE_2 ("Layover In AUA, SXM")',
  },
  "crit.checkIn": { text: "Pairing Check-In Time", source: "KB_SAMPLE_1" },
  "crit.checkOut": { text: "Pairing Check-Out Time", source: "KB_SAMPLE_1" },
  "op.before": { text: "Before <", source: 'KB_SAMPLE_1 ("Pairing Check-In Time Before < 10:00")' },
  "op.after": { text: "After >", source: 'KB_SAMPLE_1 ("Pairing Check-Out Time After > 18:00")' },
  "crit.pairingLength": {
    text: "Pairing Length",
    source: 'KB_SAMPLE_4 ("Pairing Length = 3 days")',
  },
  "unit.days": { text: "days", source: 'KB_SAMPLE_2 ("Pairing Length Between 1 days And 2 days")' },
  "crit.deadheadLegs": {
    text: "Deadhead Legs",
    source: 'AC_GUIDE p.5-26 ("Avoid Pairings If Deadhead Legs > 1 legs")',
  },
  "crit.dutyLegs": {
    text: "Duty Legs",
    source: 'AC_GUIDE p.5-30 ("Avoid Pairings If Duty Legs > 4 legs")',
  },
  "unit.legs": { text: "legs", source: "AC_GUIDE p.5-26, 5-30" },
  // KB_ANY_EVERY quotes "Avoid Pairings if Every Leg is Redeye"; the Any form is inferred.
  "crit.redeye": { text: "Any Leg is Redeye", source: "KB_ANY_EVERY" },
  "crit.departingOn": {
    text: "Departing on",
    source:
      'AC_GUIDE p.4-6 ("Award Pairings If Departing on October 10, 2013 If Pairing Number M5002")',
  },
  "crit.pairingNumber": { text: "Pairing Number", source: "AC_GUIDE p.4-6; KB_PAIRING_ON_DATE" },

  // ── Set Condition ────────────────────────────────────────────────────
  // Must sit above every Award line; may sit above or below Prefer Off / Avoid (KB_MIN_DAYS_OFF).
  "set.minCreditWindow": {
    text: "Minimum Credit Window",
    source: "ENVOY_AFA p.31, 34; KB_MIN_CREDIT",
  },
  "set.maxCreditWindow": { text: "Maximum Credit Window", source: "KB_MAX_CREDIT; KB_CATALOG" },
  "set.maxDaysOn": { text: "Maximum Days On In A Row", source: "KB_CATALOG" },
  "set.minDaysOffInARow": {
    text: "Minimum Days Off In A Row",
    source: 'KB_MIN_DAYS_OFF ("Set Condition Minimum Days Off In A Row 5")',
  },

  // ── Waive (keyed by canonical WAIVER_KEYS) ───────────────────────────
  "waive.1-in-7": { text: "1 Day Off in 7", source: "ENVOY_AFA p.29, 34; AC_GUIDE p.5-62" },
  "waive.4-in-14": { text: "4 Days Off in 14", source: "KB_CATALOG; AC_GUIDE p.5-62" },
  "waive.min-2-days-off-in-a-row": {
    text: "Minimum 2 Days Off In A Row",
    source: "ENVOY_AFA p.29, 34",
  },
  "waive.no-same-day-pairings": { text: "No Same Day Pairings", source: "ENVOY_AFA p.29, 34" },
  "waive.max-5-day-workblock": { text: "Max 5 Day Workblock", source: "KB_RESERVE_WAIVE" },

  // ── Entry UI (uiPath steps) ──────────────────────────────────────────
  "ui.bids": { text: "Bids tab", source: "ENVOY_AFA p.24, 28" },
  "ui.bidType": { text: "Current or Default tab", source: "ENVOY_AFA p.25" },
  "ui.addGroup": { text: "Add Bid Group", source: "ENVOY_AFA p.28" },
  "ui.pairingGroup": { text: "Pairing Bid Group", source: "ENVOY_AFA p.28" },
  "ui.apply": { text: "Apply", source: "ENVOY_AFA p.28-33" },
  "ui.preferOff": { text: "Prefer Off", source: "ENVOY_AFA p.31" },
  "ui.avoid": { text: "Avoid Pairings", source: "ENVOY_AFA p.31" },
  "ui.award": { text: "Award Pairings", source: "ENVOY_AFA p.31-32" },
  "ui.set": { text: "Set Condition", source: "ENVOY_AFA p.31" },
  "ui.waive": { text: "Waive", source: "ENVOY_AFA p.29" },
  "ui.datesList": { text: "Dates List", source: "KB_CATALOG" },
  "ui.datesRange": { text: "Dates Range", source: "KB_CATALOG" },
  "ui.daysOfWeekList": { text: "Days Of Week List", source: "KB_CATALOG" },
  "ui.layover": { text: "Layover", source: "KB_CATALOG" },
  "ui.redeyes": { text: "Redeyes", source: "KB_CATALOG" },
  "ui.greaterThan": { text: "Greater Than >", source: "ENVOY_AFA p.32" },
  // Inferred from ENVOY_AFA's "Greater Than >" and the KB operators article (35000210180).
  "ui.lessThan": { text: "Less Than <", source: "KB_OPERATORS" },
  "ui.pairingsTab": { text: "Pairings tab", source: "KB_PAIRING_ON_DATE" },
  "ui.addBidsMode": { text: "Red + (Add Bids Mode)", source: "KB_PAIRING_ON_DATE" },
} as const satisfies Record<string, Label>;

export type LabelKey = keyof typeof LABELS;

/** Label lookup with airline overrides from PbsDeployment.config.labels applied. */
export interface NavblueLabels {
  (key: LabelKey): string;
  /** Vendor wording for a canonical waiver key, or undefined if this deployment doesn't offer it. */
  waiver(key: string): string | undefined;
}

export function navblueLabels(overrides: Record<string, string> = {}): NavblueLabels {
  const table: Record<string, Label> = LABELS;
  return Object.assign((key: LabelKey) => overrides[key] ?? LABELS[key].text, {
    waiver: (key: string) => overrides[`waive.${key}`] ?? table[`waive.${key}`]?.text,
  });
}
