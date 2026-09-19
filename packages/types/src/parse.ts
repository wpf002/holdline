import { z } from "zod";
import { BidIntent, BidIntentDraft } from "./intent.js";

/** What the form already knows before any preferences are filled in. */
export const BidContext = BidIntent.pick({
  airline: true,
  crewGroup: true,
  month: true,
  base: true,
});
export type BidContext = z.infer<typeof BidContext>;

/** The part of a draft the plain-English parser fills. */
export const BidPreferences = BidIntentDraft.omit({
  airline: true,
  crewGroup: true,
  month: true,
  base: true,
});
export type BidPreferences = z.infer<typeof BidPreferences>;

/** POST /bids/parse */
export const ParseRequest = z.object({
  text: z.string().trim().min(1).max(2000),
  context: BidContext,
});
export type ParseRequest = z.infer<typeof ParseRequest>;

/** `intent` is null when the parser answered with questions only. */
export const ParseResponse = z.object({
  intent: BidIntentDraft.nullable(),
  questions: z.array(z.string()),
});
export type ParseResponse = z.infer<typeof ParseResponse>;
