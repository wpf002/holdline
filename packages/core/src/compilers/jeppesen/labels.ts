/**
 * Jeppesen PBS (United pilots) wording. Only statements with a documented example are emitted;
 * everything else becomes a warning until a United pilot's bid screen confirms the wording.
 * syntaxVerified stays false.
 */

export const SOURCES = {
  RESEARCH:
    "docs/pbs-research.md, Jeppesen section: examples from the Jeppesen PBS User Guide v5.30 (http://prefbid.com/forum/documents/pbs_user_guide_v5.30.pdf, offline Sept 2026)",
  EXCERPT:
    "Search excerpts of the ProBid Plus User Guide (http://probidplus.com/downloads/ProBid_Plus_User_Guide.pdf) and ABC's of PBS (http://prefbid.com/ABCs/ABCs_20.pdf); both hosts refused connections Sept 2026, so these are unread",
  RECHECK:
    "2026-09-23: prefbid.com and probidplus.com still resolve (both 70.35.196.138) but refuse HTTP connections, and no mirror of the guide turned up. Every label below is still second-hand. A United pilot's bid screen is the only way to verify them",
} as const;

type Label = { text: string; source: string };

export const LABELS = {
  "group.header": { text: "Bid Group", source: "RESEARCH (up to 20 bid groups)" },
  "stmt.award": { text: "AWARD", source: "RESEARCH" },
  "stmt.avoid": { text: "AVOID", source: "RESEARCH" },
  "stmt.waive": { text: "WAIVE", source: "RESEARCH" },
  // "AVOID Work 07 Apr -- 17 Apr"
  "crit.work": { text: "Work", source: "RESEARCH" },
  "range.to": { text: "--", source: "RESEARCH" },
  // "Award Pairing Length = 2 - HIGH"
  "crit.pairingLength": { text: "Pairing Length =", source: "EXCERPT" },
  // "Award Layover Station and Length Any SFO - HIGH"
  "crit.layover": { text: "Layover Station and Length Any", source: "EXCERPT" },
  "priority.high": { text: "- HIGH", source: "EXCERPT" },
  "waive.1-in-7": { text: "1 in 7 Day Off in Base", source: "RESEARCH" },
  "waive.min-days-between-work-blocks": {
    text: "Min days between work blocks 1",
    source: "RESEARCH",
  },
} as const satisfies Record<string, Label>;

export type LabelKey = keyof typeof LABELS;

export interface JeppesenLabels {
  (key: LabelKey): string;
  waiver(key: string): string | undefined;
}

export function jeppesenLabels(overrides: Record<string, string> = {}): JeppesenLabels {
  const table: Record<string, Label> = LABELS;
  return Object.assign((key: LabelKey) => overrides[key] ?? LABELS[key].text, {
    waiver: (key: string) => overrides[`waive.${key}`] ?? table[`waive.${key}`]?.text,
  });
}
