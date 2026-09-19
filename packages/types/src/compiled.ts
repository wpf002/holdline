import { z } from "zod";

export const PbsVendor = z.enum(["NAVBLUE", "JEPPESEN", "IBS_ADOPT", "AOS", "UNKNOWN"]);
export type PbsVendor = z.infer<typeof PbsVendor>;

export const BidDialect = z.enum(["ORDERED_GROUPS", "LAYERED", "WEIGHTED"]);
export type BidDialect = z.infer<typeof BidDialect>;

/** One line the pilot enters by hand, plus the clicks to get there. */
export const CompiledLine = z.object({
  text: z.string(),
  kind: z.enum(["SYSTEM", "SET", "PREFER_OFF", "AVOID", "AWARD", "WAIVE", "INSTRUCTION", "PROPERTY"]),
  uiPath: z.array(z.string()).default([]),
});
export type CompiledLine = z.infer<typeof CompiledLine>;

export const CompiledGroup = z.object({
  label: z.string(), // "Bid Group 1" / "Layer 3"
  relaxed: z.array(z.string()).default([]), // preference keys dropped vs group 1
  lines: z.array(CompiledLine),
});

export const CompiledBid = z.object({
  vendor: PbsVendor,
  dialect: BidDialect,
  groups: z.array(CompiledGroup),
  warnings: z.array(z.string()).default([]),
  /** false until the vendor's labels have been checked against a real bid screen */
  syntaxVerified: z.boolean(),
});
export type CompiledBid = z.infer<typeof CompiledBid>;
