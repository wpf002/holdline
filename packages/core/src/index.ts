import type { BidIntent, CompiledBid, PbsVendor } from "@holdline/types";

export class UnsupportedVendorError extends Error {
  constructor(public vendor: PbsVendor) {
    super(`No compiler for ${vendor} yet`);
  }
}

/** Entry point. Compilers live in ./compilers/<vendor>.ts and get registered here. */
export function compile(_intent: BidIntent, vendor: PbsVendor): CompiledBid {
  // TODO(phase 1): NAVBLUE compiler. See docs/pbs-research.md and CLAUDE.md.
  throw new UnsupportedVendorError(vendor);
}
