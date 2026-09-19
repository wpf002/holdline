import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { ParserError, createParser, type CreateMessage } from "./parse.js";

const request = {
  text: "Off the 10th through 12th, no reports before 8",
  context: { airline: "ENY", crewGroup: "PILOT", month: "2026-10", base: "DFW" },
} as const;

const toolUse = (input: unknown, id = "toolu_1") =>
  ({ type: "tool_use", id, name: "record_bid_preferences", input }) as Anthropic.ContentBlock;
const text = (value: string) => ({ type: "text", text: value }) as Anthropic.ContentBlock;
const message = (
  content: Anthropic.ContentBlock[],
  stop_reason: Anthropic.StopReason = "tool_use",
) =>
  ({
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "m",
    content,
    stop_reason,
  }) as Anthropic.Message;

/** Replays canned responses and records every request the parser sends. */
function fakeClient(...responses: Array<Anthropic.Message | Error>) {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const create: CreateMessage = async (params) => {
    calls.push(structuredClone(params));
    const next = responses.shift();
    if (!next) throw new Error("no canned response left");
    if (next instanceof Error) throw next;
    return next;
  };
  return { create, calls };
}

const good = {
  preferences: {
    daysOff: { ranges: [{ start: "2026-10-10", end: "2026-10-12" }] },
    pairings: { reportAfter: "08:00" },
    priorities: ["daysOff", "reportRelease"],
  },
  questions: ["Any trip length preference?"],
};

describe("createParser", () => {
  it("sends the tool, cached system prompt and context, and returns the validated tool input", async () => {
    const { create, calls } = fakeClient(message([toolUse(good)]));
    const result = await createParser(create, "claude-sonnet-4-5")(request);

    expect(result.questions).toEqual(["Any trip length preference?"]);
    expect(result.preferences).toMatchObject({
      daysOff: { ranges: [{ start: "2026-10-10", end: "2026-10-12" }], dates: [] },
      pairings: { reportAfter: "08:00", avoidRedeyes: false },
      priorities: ["daysOff", "reportRelease"],
    });

    const sent = calls[0]!;
    expect(sent.model).toBe("claude-sonnet-4-5");
    expect(sent.tool_choice).toBeUndefined();
    const tool = sent.tools?.[0] as Anthropic.Tool;
    expect(sent.tools).toHaveLength(1);
    expect(tool.name).toBe("record_bid_preferences");
    expect(tool.input_schema.type).toBe("object");
    expect(sent.system).toMatchObject([{ type: "text", cache_control: { type: "ephemeral" } }]);
    expect(sent.messages[0]!.content).toContain("Airline ENY, pilot, base DFW, bid month 2026-10.");
    expect(sent.messages[0]!.content).toContain("<description>\nOff the 10th through 12th");
  });

  it("sends validation errors back once and accepts the corrected call", async () => {
    const bad = { ...good, preferences: { ...good.preferences, pairings: { reportAfter: "8am" } } };
    const { create, calls } = fakeClient(
      message([toolUse(bad, "toolu_bad")]),
      message([toolUse(good)]),
    );
    const result = await createParser(create, "m")(request);

    expect(result.preferences?.pairings.reportAfter).toBe("08:00");
    const retry = calls[1]!.messages;
    expect(retry).toHaveLength(3);
    expect(retry[2]).toMatchObject({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "toolu_bad", is_error: true }],
    });
    const [result2] = retry[2]!.content as Anthropic.ToolResultBlockParam[];
    expect(result2!.content).toContain("preferences.pairings.reportAfter");
  });

  it("gives up after a second invalid call", async () => {
    const bad = { preferences: { daysOff: { dates: ["the 10th"] } } };
    const { create } = fakeClient(message([toolUse(bad)]), message([toolUse(bad)]));
    await expect(createParser(create, "m")(request)).rejects.toMatchObject({
      reason: "invalid_output",
    });
  });

  it("treats a prose answer as a question for the crew member", async () => {
    const { create } = fakeClient(message([text("Which month is this bid for?")], "end_turn"));
    expect(await createParser(create, "m")(request)).toEqual({
      preferences: null,
      questions: ["Which month is this bid for?"],
    });
  });

  it("maps refusals, truncation and API errors to ParserError", async () => {
    const refusal = fakeClient(message([], "refusal"));
    await expect(createParser(refusal.create, "m")(request)).rejects.toMatchObject({
      reason: "refused",
    });

    const truncated = fakeClient(message([text("{")], "max_tokens"));
    await expect(createParser(truncated.create, "m")(request)).rejects.toMatchObject({
      reason: "truncated",
    });

    const upstream = fakeClient(new Anthropic.APIError(529, undefined, "overloaded", undefined));
    const err = await createParser(upstream.create, "m")(request).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ParserError);
    expect(err).toMatchObject({ reason: "upstream", upstreamStatus: 529 });
  });
});
