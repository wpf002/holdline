import type { BidIntent, CompiledBid, DeploymentConfig, PbsVendor } from "@holdline/types";
import { compileNavblue } from "./compilers/navblue/compile.js";

export { relaxationSteps, resolvePriorities, type Priorities, type RelaxStep } from "./relax.js";
export * from "./pairings/index.js";

export class UnsupportedVendorError extends Error {
  constructor(public vendor: PbsVendor) {
    super(`No compiler for ${vendor} yet`);
  }
}

/** Entry point. Compilers live in ./compilers/<vendor>/ and get registered here. */
export function compile(
  intent: BidIntent,
  vendor: PbsVendor,
  config: DeploymentConfig = {},
): CompiledBid {
  switch (vendor) {
    case "NAVBLUE":
      return compileNavblue(intent, config);
    default:
      throw new UnsupportedVendorError(vendor);
  }
}
