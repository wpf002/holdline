import { z } from "zod";

/** Vendor-neutral description of what a crew member wants. Every compiler reads this. */
export const Weekday = z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]);
export type Weekday = z.infer<typeof Weekday>;
const IsoDate = z.iso.date(); // real calendar dates only (rejects 2026-02-30)
const HHMM = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM between 00:00 and 23:59");
const minLeMax = { message: "min must be <= max" };

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

/** Canonical waiver keys for `BidIntent.waivers`. Compilers map the ones their vendor supports and warn on the rest. */
export const WAIVER_KEYS = {
  "1-in-7": "Waive the 1 day off in 7 rule",
  "4-in-14": "Waive the 4 days off in 14 rule",
  "min-2-days-off-in-a-row": "Allow single days off",
  "no-same-day-pairings": "Allow a pairing to start the day another ends",
  "min-days-between-work-blocks": "Waive the minimum days off between work blocks",
  "max-5-day-workblock": "Reserve: allow work blocks longer than 5 days",
} as const;
export type WaiverKey = keyof typeof WAIVER_KEYS;

export const BidIntent = z.object({
  airline: z.string().min(2), // Airline.code, e.g. "ENY"
  crewGroup: z.enum(["PILOT", "FLIGHT_ATTENDANT"]),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "expected YYYY-MM"),
  base: z.string().length(3),
  lineType: z.enum(["LINEHOLDER", "RESERVE"]).default("LINEHOLDER"),
  daysOff: z
    .object({
      dates: z.array(IsoDate).default([]), // priority = array order
      daysOfWeek: z.array(Weekday).default([]), // priority = array order
      ranges: z
        .array(
          z
            .object({ start: IsoDate, end: IsoDate })
            .refine((r) => r.start <= r.end, "start must be <= end"),
        )
        .default([]),
      weekends: z.boolean().default(false),
    })
    .default({ dates: [], daysOfWeek: [], ranges: [], weekends: false }),
  pairings: z
    .object({
      lengthDays: z
        .object({ min: z.number().int().min(1), max: z.number().int().max(6) })
        .refine((r) => r.min <= r.max, minLeMax)
        .optional(),
      reportAfter: HHMM.optional(),
      releaseBefore: HHMM.optional(),
      preferLayovers: z.array(z.string().length(3)).default([]),
      avoidLayovers: z.array(z.string().length(3)).default([]),
      avoidRedeyes: z.boolean().default(false),
      avoidDeadheads: z.boolean().default(false),
      maxLegsPerDuty: z.number().int().positive().optional(),
      specific: z.array(z.object({ number: z.string().min(1), date: IsoDate })).default([]),
    })
    .default({
      preferLayovers: [],
      avoidLayovers: [],
      avoidRedeyes: false,
      avoidDeadheads: false,
      specific: [],
    }),
  line: z
    .object({
      creditMinutes: z
        .object({ min: z.number().int().nonnegative(), max: z.number().int().nonnegative() })
        .refine((r) => r.min <= r.max, minLeMax)
        .optional(),
      maxDaysOn: z.number().int().positive().optional(),
      minDaysOffInARow: z.number().int().positive().optional(),
      commutable: z.boolean().default(false),
    })
    .default({ commutable: false }),
  /** Canonical waiver keys (WAIVER_KEYS); each compiler maps what its vendor supports and warns on the rest. */
  waivers: z.array(z.string()).default([]),
  /** Most important first. Relaxation drops from the END of this list. */
  priorities: z.array(PreferenceKey).min(1),
});
export type BidIntent = z.infer<typeof BidIntent>;
