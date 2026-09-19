import { z } from "zod";

const CreditRange = z.object({
  min: z.number().int().nonnegative(),
  max: z.number().int().nonnegative(),
});

/**
 * PbsDeployment.config: per-airline limits and wording, so a label fix doesn't need a deploy.
 * Cite where each value came from in PbsDeployment.sourceUrl / notes.
 */
export const DeploymentConfig = z.object({
  /** Total bid lines the vendor accepts across all groups. */
  maxBidLines: z.number().int().positive().optional(),
  /** Cap on relaxation groups/layers for dialects that relax group by group. */
  maxGroups: z.number().int().min(2).optional(),
  /** LAYERED dialect: number of layers. */
  layers: z.number().int().positive().optional(),
  /** Overrides for the vendor label table, keyed like core/src/compilers/<vendor>/labels.ts. */
  labels: z.record(z.string(), z.string()).optional(),
  /**
   * Credit windows the airline publishes, in minutes. NAVBLUE doesn't take hours; the bidder picks a
   * window with Set Condition Minimum/Maximum Credit Window, and no condition means the normal window.
   */
  creditWindows: z
    .object({
      normal: CreditRange,
      minimum: CreditRange.optional(),
      maximum: CreditRange.optional(),
    })
    .optional(),
});
export type DeploymentConfig = z.infer<typeof DeploymentConfig>;
