import { z } from "zod";
import { PreferenceKey } from "./intent.js";
import { HoldEstimates } from "./award.js";
import { PairingMatch, PoolPreview } from "./pairing.js";

export const PbsVendor = z.enum(["NAVBLUE", "JEPPESEN", "IBS_ADOPT", "AOS", "UNKNOWN"]);
export type PbsVendor = z.infer<typeof PbsVendor>;

export const BidDialect = z.enum(["ORDERED_GROUPS", "LAYERED", "WEIGHTED"]);
export type BidDialect = z.infer<typeof BidDialect>;

/** One line the pilot enters by hand, plus the clicks to get there. */
export const CompiledLine = z.object({
  text: z.string(),
  kind: z.enum([
    "SYSTEM",
    "SET",
    "PREFER_OFF",
    "AVOID",
    "AWARD",
    "WAIVE",
    "INSTRUCTION",
    "PROPERTY",
  ]),
  uiPath: z.array(z.string()).default([]),
  /** The BidIntent preference this line expresses. Absent for system lines and hard constraints. */
  preference: PreferenceKey.optional(),
  /** What the line selects, for pool previews. Absent when it doesn't filter pairings (Set Condition, Waive). */
  match: PairingMatch.optional(),
  /**
   * What the line does to the pool for the lines below it: drop matching pairings, keep only
   * matching ones (layered pairing properties), or just prefer them. Defaults from `kind`:
   * AVOID and PREFER_OFF remove, everything else prefers.
   */
  effect: z.enum(["remove", "keep", "prefer"]).optional(),
});
export type CompiledLine = z.infer<typeof CompiledLine>;

export const CompiledGroup = z.object({
  label: z.string(), // "Bid Group 1" / "Layer 3"
  relaxed: z.array(z.string()).default([]), // preference keys dropped vs group 1
  lines: z.array(CompiledLine),
});
export type CompiledGroup = z.infer<typeof CompiledGroup>;

export const CompiledBid = z.object({
  vendor: PbsVendor,
  dialect: BidDialect,
  groups: z.array(CompiledGroup),
  warnings: z.array(z.string()).default([]),
  /** false until the vendor's labels have been checked against a real bid screen */
  syntaxVerified: z.boolean(),
});
export type CompiledBid = z.infer<typeof CompiledBid>;

/** POST /bids/compile body: a BidIntent plus the bidder's seniority for hold estimates. */
export const CompileExtras = z.object({ seniority: z.number().int().min(1).optional() });

/**
 * POST /bids/compile: the bid, pairing counts when the bid period has been imported, and hold
 * estimates when past award results for the base have been imported.
 */
export const CompileResponse = CompiledBid.extend({
  preview: PoolPreview.nullable(),
  holds: HoldEstimates.nullable(),
});
export type CompileResponse = z.infer<typeof CompileResponse>;
