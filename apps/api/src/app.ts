import cors from "@fastify/cors";
import { UnsupportedVendorError, compile } from "@holdline/core";
import {
  BidIntent,
  BidIntentDraft,
  DeploymentConfig,
  ParseRequest,
  type ParseResponse,
  type PbsVendor,
} from "@holdline/types";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { ParserError, type Parser } from "./parse.js";

type CrewGroup = BidIntent["crewGroup"];

export interface DeploymentRecord {
  crewGroup: CrewGroup;
  vendor: PbsVendor;
  confidence: "CONFIRMED" | "THIRD_PARTY" | "INFERRED";
  config: unknown;
}

export interface AirlineRecord {
  code: string;
  name: string;
  deployments: DeploymentRecord[];
}

/** What the routes read. server.ts backs this with Prisma; tests pass fixtures. */
export interface Store {
  listAirlines(): Promise<unknown>;
  findAirline(code: string): Promise<AirlineRecord | null>;
}

const CREW_NAMES: Record<CrewGroup, string> = {
  PILOT: "pilots",
  FLIGHT_ATTENDANT: "flight attendants",
};

export interface Deps {
  store: Store;
  /** Absent when ANTHROPIC_API_KEY isn't set; /bids/parse then answers 503. */
  parser?: Parser;
}

export async function buildApp(
  { store, parser }: Deps,
  opts: { corsOrigins?: string[]; logger?: boolean } = {},
) {
  const app = Fastify({ logger: opts.logger ?? false });
  await app.register(cors, { origin: opts.corsOrigins ?? false });

  app.get("/health", async () => ({ ok: true }));

  // Vertical slice: real rows from Postgres.
  app.get("/airlines", async () => store.listAirlines());

  app.post("/bids/compile", async (req, reply) => {
    const parsed = BidIntent.safeParse(req.body);
    if (!parsed.success)
      return reply.code(400).send({ error: "invalid_intent", issues: parsed.error.issues });
    const intent = { ...parsed.data, airline: parsed.data.airline.toUpperCase() };

    const airline = await store.findAirline(intent.airline);
    if (!airline)
      return reply.code(404).send({ error: "unknown_airline", airline: intent.airline });
    const deployment = airline.deployments.find((d) => d.crewGroup === intent.crewGroup);
    if (!deployment) {
      return reply
        .code(404)
        .send({ error: "no_pbs_deployment", airline: airline.code, crewGroup: intent.crewGroup });
    }
    const config = DeploymentConfig.safeParse(deployment.config);
    if (!config.success) {
      req.log.error(
        { airline: airline.code, issues: config.error.issues },
        "invalid PbsDeployment.config",
      );
      return reply.code(500).send({ error: "invalid_deployment_config" });
    }

    try {
      const bid = compile(intent, deployment.vendor, config.data);
      if (deployment.confidence !== "CONFIRMED") {
        const basis =
          deployment.confidence === "INFERRED" ? "inferred" : "from a third-party source";
        bid.warnings.push(
          `${airline.name} ${CREW_NAMES[intent.crewGroup]} on ${deployment.vendor}: ${basis}, not confirmed by the airline or union. Check your bid screen matches before entering.`,
        );
      }
      return bid;
    } catch (err) {
      if (err instanceof UnsupportedVendorError) {
        return reply.code(501).send({
          error: "not_implemented",
          todo: `${err.vendor} compiler (build step 5+)`,
          vendor: err.vendor,
        });
      }
      throw err;
    }
  });

  // Plain English -> draft intent. The form stays the source of truth; this only pre-fills it.
  app.post("/bids/parse", async (req, reply) => {
    const body = ParseRequest.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: "invalid_request", issues: body.error.issues });
    }
    if (!parser) {
      return reply.code(503).send({
        error: "parser_not_configured",
        todo: "Set ANTHROPIC_API_KEY for the API to turn on plain-English parsing.",
      });
    }
    try {
      const { preferences, questions } = await parser(body.data);
      const intent = preferences
        ? BidIntentDraft.parse({ ...preferences, ...body.data.context })
        : null;
      return { intent, questions } satisfies ParseResponse;
    } catch (err) {
      if (err instanceof ParserError) {
        req.log.warn({ reason: err.reason, status: err.upstreamStatus }, "parser failed");
        return reply.code(502).send({ error: "parser_failed", reason: err.reason });
      }
      throw err;
    }
  });

  const todo = (what: string) => async (_req: FastifyRequest, reply: FastifyReply) =>
    reply.code(501).send({ error: "not_implemented", todo: what });

  app.post("/bid-periods/import", todo("pairing file parser per airline (phase 3)"));

  return app;
}
