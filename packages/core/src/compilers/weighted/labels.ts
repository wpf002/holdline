/**
 * IBS / AD OPT (weighted PBS) wording. Only the bid options Endeavor AFA's help page names are
 * emitted; everything else warns. Not compared with a live bid screen, so syntaxVerified stays false.
 */

export const SOURCES = {
  EDV_AFA:
    "https://edvafa.org/pbs-bidding-help (Endeavor AFA, PBS Bidding Help: Desire/Avoid, points, option names; fetched Sept 2026)",
} as const;

type Label = { text: string; source: string };

export const LABELS = {
  "group.preferences": { text: "Preferences", source: "EDV_AFA" },
  "opt.dateOff": { text: "Desire Specific Date Off", source: "EDV_AFA" },
  "opt.daysOff": { text: "Desire Days Off", source: "EDV_AFA" },
  "opt.weekendsOff": { text: "Desire Weekends Off", source: "EDV_AFA" },
  "opt.lengthIs": { text: "Desire Pairing Length In Days equal to", source: "EDV_AFA" },
  "opt.lengthAbove": { text: "Avoid Pairing Length In Days greater than", source: "EDV_AFA" },
  "opt.workingDaysAbove": {
    text: "Avoid Consecutive Working Days Greater Than",
    source: "EDV_AFA",
  },
  // "Don't Put Everything at 1000 Points" (EDV_AFA): 1000 is the top of the scale.
  points: { text: "points", source: "EDV_AFA" },
} as const satisfies Record<string, Label>;

export type LabelKey = keyof typeof LABELS;
export type WeightedLabels = (key: LabelKey) => string;

export function weightedLabels(overrides: Record<string, string> = {}): WeightedLabels {
  return (key) => overrides[key] ?? LABELS[key].text;
}
