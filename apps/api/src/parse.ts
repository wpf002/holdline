import Anthropic from "@anthropic-ai/sdk";
import { BidPreferences, WAIVER_KEYS, type BidContext, type ParseRequest } from "@holdline/types";
import { z } from "zod";

/** Plain English -> the preference half of a BidIntentDraft, via Anthropic tool use. */

const TOOL_NAME = "record_bid_preferences";

const ToolInput = z.object({
  preferences: BidPreferences,
  questions: z.array(z.string()).default([]),
});
export type ParseResult = { preferences: BidPreferences | null; questions: string[] };

function inputSchema(): Anthropic.Tool.InputSchema {
  const schema: Record<string, unknown> = z.toJSONSchema(ToolInput, { io: "input" });
  delete schema.$schema;
  return schema as Anthropic.Tool.InputSchema;
}

const TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description:
    "Record the bid preferences read from the crew member's description, plus questions about anything that matters but is unclear.",
  input_schema: inputSchema(),
};

// Stable across requests so it caches with the tool definition. Per-request context goes in the user turn.
const SYSTEM = `You fill in Holdline's bid form from an airline crew member's description of the schedule they want for one bid month. Call the ${TOOL_NAME} tool once with the preferences you can read from their words.

Field notes:
- Dates are YYYY-MM-DD inside the bid month given in the message. daysOff.dates holds separate days, most important first. daysOff.ranges holds runs of consecutive days off.
- daysOff.daysOfWeek uses MON..SUN, most important first. daysOff.weekends means as many Saturday-Sunday pairs off as possible.
- pairings.lengthDays is trip length in days: "3-day trips" is {min: 3, max: 3}, "nothing longer than 3 days" is {min: 1, max: 3}.
- reportAfter and releaseBefore are 24-hour local times: "no reports before 8" is reportAfter "08:00".
- Layovers are 3-letter airport codes.
- line.creditMinutes is monthly credit in minutes: 75 hours is 4500. It's a window, so when they name one figure put it in both min and max and Holdline widens it.
- waivers only takes these keys: ${Object.keys(WAIVER_KEYS).join(", ")}.
- lineType is RESERVE only when they ask for reserve.
- priorities lists the preference keys you filled, most important first: use what they say matters most, otherwise the order they mention things.

Leave out anything they didn't ask for, and don't invent numbers. Put a short question in questions when something that matters is ambiguous or can't be expressed in these fields.`;

function describe(text: string, c: BidContext): string {
  const crew = c.crewGroup === "PILOT" ? "pilot" : "flight attendant";
  return `Airline ${c.airline}, ${crew}, base ${c.base}, bid month ${c.month}.\n\n<description>\n${text}\n</description>`;
}

/** Half the window Holdline opens around a single credit figure, in minutes. */
const CREDIT_SPREAD = 300;

/**
 * "About 80 hours" comes back as 80:00-80:00, and no PBS builds a line to an exact credit value:
 * NAVBLUE matches it against a credit window, layered PBS puts it in Target Credit Range. So a
 * zero-width window becomes 75:00-85:00 and the crew member is told, since they own the form.
 */
function widenCredit(result: ParseResult): ParseResult {
  const credit = result.preferences?.line?.creditMinutes;
  if (!credit || credit.min !== credit.max) return result;
  const line = {
    ...result.preferences!.line,
    creditMinutes: { min: Math.max(0, credit.min - CREDIT_SPREAD), max: credit.max + CREDIT_SPREAD },
  };
  return {
    preferences: { ...result.preferences!, line },
    questions: [
      ...result.questions,
      `You gave one credit figure, ${hhmm(credit.min)}. Holdline widened it to ${hhmm(line.creditMinutes.min)}-${hhmm(line.creditMinutes.max)}, because PBS bids a credit range. Change it below if you want it tighter.`,
    ],
  };
}

const hhmm = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;

export class ParserError extends Error {
  constructor(
    public reason: "refused" | "truncated" | "invalid_output" | "upstream",
    public upstreamStatus?: number,
  ) {
    super(`parser failed: ${reason}`);
  }
}

export type CreateMessage = (
  params: Anthropic.MessageCreateParamsNonStreaming,
) => Promise<Anthropic.Message>;
export type Parser = (req: ParseRequest) => Promise<ParseResult>;

export function createParser(create: CreateMessage, model: string): Parser {
  return async ({ text, context }) => {
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: describe(text, context) }];
    // A second attempt only when the tool input fails validation; the model sees the errors.
    for (let attempt = 0; attempt < 2; attempt++) {
      let res: Anthropic.Message;
      try {
        res = await create({
          model,
          max_tokens: 4096,
          system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
          tools: [TOOL],
          messages,
        });
      } catch (err) {
        if (err instanceof Anthropic.APIError) throw new ParserError("upstream", err.status);
        throw err;
      }
      if (res.stop_reason === "refusal") throw new ParserError("refused");
      if (res.stop_reason === "max_tokens") throw new ParserError("truncated");

      const call = res.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === TOOL_NAME,
      );
      if (!call) {
        // Answered in prose instead of filling the form: treat it as a question for the crew member.
        const prose = res.content
          .flatMap((b) => (b.type === "text" ? [b.text] : []))
          .join("\n")
          .trim();
        return { preferences: null, questions: prose ? [prose] : [] };
      }
      const input = ToolInput.safeParse(call.input);
      if (input.success) return widenCredit(input.data);

      const problems = input.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      messages.push(
        { role: "assistant", content: res.content },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: call.id,
              is_error: true,
              content: `These values didn't validate: ${problems}. Call ${TOOL_NAME} again with them fixed.`,
            },
          ],
        },
      );
    }
    throw new ParserError("invalid_output");
  };
}
