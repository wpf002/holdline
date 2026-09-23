/**
 * Layered PBS wording. The default table is American's, taken from the JCBA Flight Attendant PBS
 * Guide (10JAN19) contents pages, which list every property by tab. SkyWest's AOS names differ on
 * nine properties; those live in PbsDeployment.config.labels (see packages/db/prisma/seed.ts).
 * Checked 2026-09-23. Still syntaxVerified: false — no screenshot of either airline's bid screen.
 */

export const SOURCES = {
  APFA_GUIDE:
    "https://www.apfa.org/wp-content/uploads/2019/01/Flight-Attendant-PBS-Guide_10JAN19.pdf (JCBA PBS Guide, American FAs: Days Off / Pairing / Line / Reserve tabs, property names from the contents pages, 7 layers)",
  AOS: "https://www.swprefbid.com/aospbs/online_docs_SKYW.html (SkyWest AOS PBS: Off Days, Pairings, Pairing Properties, Line Properties, Reserve; 'seven layers')",
  APFA_TCR:
    "https://www.apfa.org/wp-content/uploads/2020/07/PBS-Target-Credit-Range_Min-Max-Credit.pdf (Target Credit Range: default 70-90, bid it in layer 1)",
  RESEARCH: "docs/pbs-research.md, Layered section",
} as const;

type Label = { text: string; source: string };

export const LABELS = {
  layer: { text: "Layer", source: "APFA_GUIDE (7 layers); AOS ('seven layers')" },
  "tab.daysOff": { text: "Days Off", source: "APFA_GUIDE (DAYS OFF TAB)" },
  "tab.pairing": { text: "Pairing", source: "APFA_GUIDE (PAIRING TAB)" },
  "tab.line": { text: "Line", source: "APFA_GUIDE (LINE TAB)" },
  // American picks dates on the Days Off tab calendar ("Selecting Days Off"), so there's no
  // property name to quote. AOS calls the same thing Off Days -> Specific day of month.
  "prop.daysOff": { text: "Days Off", source: "APFA_GUIDE (Selecting Days Off); AOS (Off Days)" },
  // Only AOS documents a day-of-week off preference (Off Days -> Day of week). American crews pick
  // those dates on the calendar, so this wording is unconfirmed for American.
  "prop.daysOfWeek": { text: "Days Off on Day of Week", source: "AOS (Off Days: day of week)" },
  "prop.weekends": {
    text: "Maximize Weekend Days Off",
    source: "APFA_GUIDE; AOS calls it Max Weekend Days Off",
  },
  "prop.pairingLength": {
    text: "Prefer Pairing Length",
    source: "APFA_GUIDE; AOS calls it Pairing Length",
  },
  "prop.reportBetween": { text: "Report Between", source: "APFA_GUIDE; AOS" },
  "prop.releaseBetween": { text: "Release Between", source: "APFA_GUIDE; AOS" },
  "prop.layoverAt": { text: "Layover at City", source: "APFA_GUIDE; AOS" },
  // AOS has no separate avoid property; SkyWest crews set Avoid on Layover at City itself.
  "prop.avoidLayoverAt": { text: "Avoid Layover at City", source: "APFA_GUIDE" },
  "prop.pairingOnDate": {
    text: "Pairing ID on a Specific Date",
    source: "APFA_GUIDE; AOS calls it Pairing ID on a date",
  },
  "prop.creditRange": {
    text: "Target Credit Range",
    source: "APFA_GUIDE (Target Credit Range (TCR)); APFA_TCR; AOS calls it Target Line Credit Range",
  },
  "prop.workBlockSize": { text: "Work Block Size", source: "APFA_GUIDE; AOS" },
  "prop.minDaysOffBetween": {
    text: "Minimum Days Off Between Work Blocks",
    source: "APFA_GUIDE; AOS calls it Min Off Days Between Work Blocks",
  },
  "prop.commutable": { text: "Commutable Work Block", source: "APFA_GUIDE; AOS" },
  "prop.avoidDeadheads": {
    text: "Avoid Deadheads",
    source: "APFA_GUIDE (Prefer Deadheads / Avoid Deadheads); AOS calls it Deadhead Preference",
  },
  "prop.maxLandings": {
    text: "Maximum Landing per Duty",
    source: "APFA_GUIDE; AOS calls it Max Landings Per Duty Period",
  },
} as const satisfies Record<string, Label>;

export type LabelKey = keyof typeof LABELS;
export type LayeredLabels = (key: LabelKey) => string;

export function layeredLabels(overrides: Record<string, string> = {}): LayeredLabels {
  return (key) => overrides[key] ?? LABELS[key].text;
}
