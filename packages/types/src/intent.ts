import { z } from "zod";

/** Vendor-neutral description of what a crew member wants. Every compiler reads this. */
export const Weekday = z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]);
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const HHMM = z.string().regex(/^\d{2}:\d{2}$/);

export const PreferenceKey = z.enum([
  "daysOff",
  "pairingLength",
  "reportRelease",
  "layovers",
  "specificPairings",
  "credit",
  "workBlocks",
]);
export type PreferenceKey = z.infer<typeof PreferenceKey>;

export const BidIntent = z.object({
  airline: z.string().min(2), // Airline.code, e.g. "ENY"
  crewGroup: z.enum(["PILOT", "FLIGHT_ATTENDANT"]),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  base: z.string().length(3),
  lineType: z.enum(["LINEHOLDER", "RESERVE"]).default("LINEHOLDER"),
  daysOff: z
    .object({
      dates: z.array(IsoDate).default([]), // priority = array order
      daysOfWeek: z.array(Weekday).default([]),
      ranges: z.array(z.object({ start: IsoDate, end: IsoDate })).default([]),
      weekends: z.boolean().default(false),
    })
    .default({ dates: [], daysOfWeek: [], ranges: [], weekends: false }),
  pairings: z
    .object({
      lengthDays: z.object({ min: z.number().int().min(1), max: z.number().int().max(6) }).optional(),
      reportAfter: HHMM.optional(),
      releaseBefore: HHMM.optional(),
      preferLayovers: z.array(z.string().length(3)).default([]),
      avoidLayovers: z.array(z.string().length(3)).default([]),
      avoidRedeyes: z.boolean().default(false),
      avoidDeadheads: z.boolean().default(false),
      maxLegsPerDuty: z.number().int().positive().optional(),
      specific: z.array(z.object({ number: z.string(), date: IsoDate })).default([]),
    })
    .default({ preferLayovers: [], avoidLayovers: [], avoidRedeyes: false, avoidDeadheads: false, specific: [] }),
  line: z
    .object({
      creditMinutes: z.object({ min: z.number().int(), max: z.number().int() }).optional(),
      maxDaysOn: z.number().int().positive().optional(),
      minDaysOffInARow: z.number().int().positive().optional(),
      commutable: z.boolean().default(false),
    })
    .default({ commutable: false }),
  /** Canonical waiver keys; each compiler maps what its vendor supports and warns on the rest. */
  waivers: z.array(z.string()).default([]),
  /** Most important first. Relaxation drops from the END of this list, one per bid group/layer. */
  priorities: z.array(PreferenceKey).min(1),
});
export type BidIntent = z.infer<typeof BidIntent>;
