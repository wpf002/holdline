import { z } from "zod";
import { BidIntent, Weekday } from "./intent.js";

const IsoDate = z.iso.date();
const HHMM = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM between 00:00 and 23:59");
const LocalDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/, "expected YYYY-MM-DDTHH:MM");
const Station = z
  .string()
  .regex(/^[A-Za-z]{3}$/, "expected a 3-letter airport code")
  .transform((s) => s.toUpperCase());

/** One flight segment. Times are local to the departure and arrival stations. */
export const Leg = z.object({
  /** Duty period within the pairing, starting at 1. */
  duty: z.number().int().min(1),
  flight: z.string().optional(),
  from: Station,
  to: Station,
  departs: LocalDateTime,
  arrives: LocalDateTime,
  deadhead: z.boolean().default(false),
  /** When absent, a leg that arrives on a later date than it departs counts as a red-eye. */
  redeye: z.boolean().optional(),
});
export type Leg = z.infer<typeof Leg>;

/** One pairing (trip/sequence) from a bid period, in Holdline's import format. */
export const Pairing = z.object({
  number: z.string().trim().min(1),
  /** Report date, local. */
  startDate: IsoDate,
  /** Calendar days from report to release. */
  days: z.number().int().min(1).max(10),
  creditMinutes: z.number().int().nonnegative(),
  tafbMinutes: z.number().int().nonnegative().optional(),
  /** First check-in, local. */
  report: HHMM.optional(),
  /** Last check-out, local. */
  release: HHMM.optional(),
  layovers: z.array(Station).default([]),
  legs: z.array(Leg).default([]),
});
export type Pairing = z.infer<typeof Pairing>;

export const PairingFormat = z.enum(["holdline-csv", "holdline-json"]);
export type PairingFormat = z.infer<typeof PairingFormat>;

/** POST /bid-periods/import */
export const ImportRequest = BidIntent.pick({
  airline: true,
  crewGroup: true,
  month: true,
  base: true,
}).extend({
  format: PairingFormat,
  data: z.string().min(1),
});
export type ImportRequest = z.infer<typeof ImportRequest>;

export const ImportError = z.object({ line: z.number().int(), message: z.string() });
export type ImportError = z.infer<typeof ImportError>;

export const ImportResponse = z.object({
  imported: z.number().int(),
  errors: z.array(ImportError),
});
export type ImportResponse = z.infer<typeof ImportResponse>;

/**
 * Machine-readable meaning of a compiled line, so previews can count the pairings it touches.
 * Vendor-neutral: every compiler attaches the same shapes.
 */
export const PairingMatch = z.discriminatedUnion("type", [
  /** Works on any of these dates. */
  z.object({ type: z.literal("worksOn"), dates: z.array(IsoDate) }),
  z.object({ type: z.literal("worksOnWeekday"), days: z.array(Weekday) }),
  z.object({ type: z.literal("worksWeekend") }),
  z.object({ type: z.literal("lengthBelow"), days: z.number().int() }),
  z.object({ type: z.literal("lengthAbove"), days: z.number().int() }),
  z.object({ type: z.literal("lengthIs"), days: z.number().int() }),
  z.object({ type: z.literal("lengthBetween"), min: z.number().int(), max: z.number().int() }),
  z.object({ type: z.literal("reportBefore"), time: HHMM }),
  z.object({ type: z.literal("releaseAfter"), time: HHMM }),
  /** Report inside [from, to]; from "08:00" to "23:59" means report at or after 08:00. */
  z.object({ type: z.literal("reportBetween"), from: HHMM, to: HHMM }),
  z.object({ type: z.literal("releaseBetween"), from: HHMM, to: HHMM }),
  z.object({ type: z.literal("layoverIn"), stations: z.array(z.string()) }),
  z.object({ type: z.literal("pairingOn"), number: z.string(), date: IsoDate }),
  z.object({ type: z.literal("redeye") }),
  z.object({ type: z.literal("deadhead") }),
  z.object({ type: z.literal("dutyLegsAbove"), legs: z.number().int() }),
  /** Every pairing still in the pool, e.g. NAVBLUE's closing Award Pairings. */
  z.object({ type: z.literal("any") }),
]);
export type PairingMatch = z.infer<typeof PairingMatch>;

/** Counts for one bid line against an imported bid period, like NAVBLUE's Bid Analyzer. */
export const LinePreview = z.object({
  /** Pairings still in the pool that this line matches. Avoid and Prefer Off lines remove them. */
  matched: z.number().int(),
  /** Pool size after this line. */
  poolAfter: z.number().int(),
  /** Pairings the import didn't have enough detail to check, e.g. no legs. */
  unknown: z.number().int(),
});
export type LinePreview = z.infer<typeof LinePreview>;

export const PoolPreview = z.object({
  /** Pairings in the imported bid period. */
  pairings: z.number().int(),
  importedAt: z.string(),
  /** Mirrors CompiledBid.groups[].lines; null where a line doesn't filter pairings. */
  groups: z.array(z.object({ lines: z.array(LinePreview.nullable()) })),
});
export type PoolPreview = z.infer<typeof PoolPreview>;
