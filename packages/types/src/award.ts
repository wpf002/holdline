import { z } from "zod";
import { BidIntent } from "./intent.js";

const IsoDate = z.iso.date();

/**
 * One awarded pairing, or one line total, from a past bid period's results. Holds seniority only:
 * names and employee numbers are never read or stored.
 */
export const Award = z.object({
  /** Seniority number in the bid category; lower is more senior. */
  seniority: z.number().int().min(1),
  pairingNumber: z.string().trim().min(1).optional(),
  /** Report date of the awarded pairing. */
  pairingDate: IsoDate.optional(),
  lineCreditMinutes: z.number().int().nonnegative().optional(),
  /** Awarded reserve rather than a line. */
  reserve: z.boolean().default(false),
});
export type Award = z.infer<typeof Award>;

export const AwardFormat = z.enum(["holdline-awards-csv"]);
export type AwardFormat = z.infer<typeof AwardFormat>;

/** POST /awards/import */
export const AwardImportRequest = BidIntent.pick({
  airline: true,
  crewGroup: true,
  month: true,
  base: true,
}).extend({
  format: AwardFormat,
  data: z.string().min(1),
});
export type AwardImportRequest = z.infer<typeof AwardImportRequest>;

/** Seniority cutoffs for one past month. */
export const MonthCutoff = z.object({
  month: z.string(),
  /** Most junior seniority awarded a line (not reserve). */
  lastLineholder: z.number().int().nullable(),
  /** Most senior seniority awarded reserve. */
  firstReserve: z.number().int().nullable(),
});
export type MonthCutoff = z.infer<typeof MonthCutoff>;

/** How far down the list pairings matching one bid line went in a past month. */
export const LineHold = z.object({
  month: z.string(),
  /** Most junior seniority awarded a matching pairing; null when none were awarded. */
  juniorMost: z.number().int().nullable(),
  /** Matching pairings awarded that month. */
  awarded: z.number().int(),
});
export type LineHold = z.infer<typeof LineHold>;

export const HoldEstimates = z.object({
  seniority: z.number().int().nullable(),
  /** Newest month first. */
  months: z.array(MonthCutoff),
  /** Mirrors CompiledBid.groups[].lines; null where history can't say anything about a line. */
  groups: z.array(z.object({ lines: z.array(z.array(LineHold).nullable()) })),
});
export type HoldEstimates = z.infer<typeof HoldEstimates>;
