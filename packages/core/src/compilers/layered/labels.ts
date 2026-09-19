/**
 * Layered PBS wording (SkyWest AOS, and American's 7-layer PBS, which lists the same properties).
 * From SkyWest's AOS bidding docs and docs/pbs-research.md; not yet compared with either airline's
 * screen, so syntaxVerified stays false. Airline differences go in PbsDeployment.config.labels.
 */

export const SOURCES = {
  AOS: "https://www.swprefbid.com/aospbs/online_docs_SKYW.html (SkyWest AOS PBS docs: bid preferences, 7 layers, 'or' within a category, 'and' across)",
  RESEARCH: "docs/pbs-research.md, Layered section (American pilots and APFA guide)",
  APFA_TCR:
    "https://www.apfa.org/wp-content/uploads/2020/07/PBS-Target-Credit-Range_Min-Max-Credit.pdf (Target Credit Range: default 70-90, bid it in layer 1)",
} as const;

type Label = { text: string; source: string };

export const LABELS = {
  layer: { text: "Layer", source: "AOS; RESEARCH" },
  "tab.daysOff": { text: "Days Off", source: "RESEARCH (tabs Pairing / LH Days Off / Line)" },
  "tab.pairing": { text: "Pairing", source: "RESEARCH" },
  "tab.line": { text: "Line", source: "RESEARCH" },
  "prop.daysOff": { text: "Days Off", source: "AOS (Off Days: specific day of month)" },
  "prop.daysOfWeek": { text: "Days Off on Day of Week", source: "AOS (Off Days: day of week)" },
  "prop.weekends": { text: "Max Weekend Days Off", source: "AOS" },
  "prop.pairingLength": { text: "Pairing Length", source: "AOS; RESEARCH" },
  "prop.reportBetween": { text: "Report Between", source: "AOS; RESEARCH" },
  "prop.releaseBetween": { text: "Release Between", source: "AOS; RESEARCH" },
  "prop.layoverAt": { text: "Layover at City", source: "AOS; RESEARCH" },
  "prop.avoidLayoverAt": {
    text: "Avoid Layover at City",
    source: "RESEARCH (Layover at City, + on Date, Avoid)",
  },
  "prop.pairingOnDate": {
    text: "Pairing ID on Date",
    source: "AOS (Pairings: pairing ID on a date)",
  },
  "prop.creditRange": {
    text: "Target Credit Range",
    source: "APFA_TCR; RESEARCH; AOS calls it Target Line Credit Range",
  },
  "prop.workBlockSize": { text: "Work Block Size", source: "AOS; RESEARCH" },
  "prop.minDaysOffBetween": { text: "Min Off Days Between Work Blocks", source: "AOS" },
  "prop.commutable": { text: "Commutable Work Block", source: "AOS; RESEARCH" },
  "prop.avoidDeadheads": {
    text: "Avoid Deadheads",
    source: "RESEARCH (Prefer/Avoid Deadheads); AOS: Deadhead Preference",
  },
  "prop.maxLandings": { text: "Max Landings per Duty Period", source: "AOS" },
} as const satisfies Record<string, Label>;

export type LabelKey = keyof typeof LABELS;
export type LayeredLabels = (key: LabelKey) => string;

export function layeredLabels(overrides: Record<string, string> = {}): LayeredLabels {
  return (key) => overrides[key] ?? LABELS[key].text;
}
