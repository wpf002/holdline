import type {
  BidDialect,
  BidIntent,
  CompiledBid,
  DeploymentConfig,
  PbsVendor,
} from "@holdline/types";
import { compileJeppesen } from "./compilers/jeppesen/compile.js";
import { compileLayered } from "./compilers/layered/compile.js";
import { compileNavblue } from "./compilers/navblue/compile.js";
import { compileWeighted } from "./compilers/weighted/compile.js";

export { relaxationSteps, resolvePriorities, type Priorities, type RelaxStep } from "./relax.js";
export * from "./awards/index.js";
export * from "./pairings/index.js";

export class UnsupportedVendorError extends Error {
  constructor(public vendor: PbsVendor) {
    super(`No compiler for ${vendor} yet`);
  }
}

/** Whether compile() has a compiler for this deployment. The web reads this through GET /airlines. */
export function canCompile(vendor: PbsVendor, dialect?: BidDialect): boolean {
  return (
    vendor === "NAVBLUE" ||
    vendor === "JEPPESEN" ||
    vendor === "AOS" ||
    vendor === "IBS_ADOPT" ||
    (vendor === "UNKNOWN" && dialect === "LAYERED")
  );
}

/**
 * Entry point. Compilers live in ./compilers/<vendor>/ and get registered here. `dialect` picks the
 * compiler when the vendor alone doesn't, e.g. American's unnamed 7-layer PBS.
 */
export function compile(
  intent: BidIntent,
  vendor: PbsVendor,
  config: DeploymentConfig = {},
  dialect?: BidDialect,
): CompiledBid {
  switch (vendor) {
    case "NAVBLUE":
      return compileNavblue(intent, config);
    case "JEPPESEN":
      return compileJeppesen(intent, config);
    case "AOS":
      return compileLayered(intent, vendor, config);
    case "IBS_ADOPT":
      return compileWeighted(intent, config);
    case "UNKNOWN":
      if (dialect === "LAYERED") return compileLayered(intent, vendor, config);
      throw new UnsupportedVendorError(vendor);
    default:
      throw new UnsupportedVendorError(vendor);
  }
}
