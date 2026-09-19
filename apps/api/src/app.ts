import cors from "@fastify/cors";
import {
  UnsupportedVendorError,
  canCompile,
  compile,
  parsePairingFile,
  previewPool,
} from "@holdline/core";
import {
  BidIntent,
  BidIntentDraft,
  DeploymentConfig,
  ImportRequest,
  ParseRequest,
  type CompileResponse,
  type ImportResponse,
  type Pairing,
  type BidDialect,
  type ParseResponse,
  type PbsVendor,
} from "@holdline/types";
import Fastify, { type FastifyReply } from "fastify";
import { ParserError, type Parser } from "./parse.js";

type CrewGroup = BidIntent["crewGroup"];

export interface DeploymentRecord {
  id: string;
  crewGroup: CrewGroup;
  vendor: PbsVendor;
  dialect: BidDialect;
  confidence: "CONFIRMED" | "THIRD_PARTY" | "INFERRED";
  config: unknown;
}

export interface AirlineRecord {
  code: string;
  name: string;
  deployments: DeploymentRecord[];
}

export interface PairingPeriod {
  importedAt: Date;
  pairings: Pairing[];
}

/** What the routes read and write. store.ts backs this with Prisma; tests pass fixtures. */
export interface Store {
  listAirlines(): Promise<AirlineRecord[]>;
  findAirline(code: string): Promise<AirlineRecord | null>;
  /** The imported pairings for one deployment, base and month, or null if none were imported. */
  loadPairings(deploymentId: string, base: string, month: string): Promise<PairingPeriod | null>;
  /** Replaces the pairings for one deployment, base and month. */
  savePairings(
    deploymentId: string,
    base: string,
    month: string,
    pairings: Pairing[],
  ): Promise<void>;
}

export interface Deps {
  store: Store;
  /** Absent when ANTHROPIC_API_KEY isn't set; /bids/parse then answers 503. */
  parser?: Parser;
}

const CREW_NAMES: Record<CrewGroup, string> = {
  PILOT: "pilots",
  FLIGHT_ATTENDANT: "flight attendants",
};

/** A month of pairings for one base is a few MB at most. */
const IMPORT_BODY_LIMIT = 10 * 1024 * 1024;

export async function buildApp(
  { store, parser }: Deps,
  opts: { corsOrigins?: string[]; logger?: boolean } = {},
) {
  const app = Fastify({ logger: opts.logger ?? false });
  await app.register(cors, { origin: opts.corsOrigins ?? false });

  /** The PBS deployment for an airline and crew group; answers 404 and returns null when missing. */
  async function findDeployment(code: string, crewGroup: CrewGroup, reply: FastifyReply) {
    const airline = await store.findAirline(code);
    if (!airline) {
      reply.code(404).send({ error: "unknown_airline", airline: code });
      return null;
    }
    const deployment = airline.deployments.find((d) => d.crewGroup === crewGroup);
    if (!deployment) {
      reply.code(404).send({ error: "no_pbs_deployment", airline: airline.code, crewGroup });
      return null;
    }
    return { airline, deployment };
  }

  app.get("/health", async () => ({ ok: true }));

  // Airlines with the PBS each crew group uses, and whether Holdline can write bids for it yet.
  app.get("/airlines", async () =>
    (await store.listAirlines()).map((a) => ({
      code: a.code,
      name: a.name,
      deployments: a.deployments.map((d) => ({
        crewGroup: d.crewGroup,
        vendor: d.vendor,
        dialect: d.dialect,
        confidence: d.confidence,
        compilable: canCompile(d.vendor, d.dialect),
      })),
    })),
  );

  app.post("/bids/compile", async (req, reply) => {
    const parsed = BidIntent.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_intent", issues: parsed.error.issues });
    }
    const intent = {
      ...parsed.data,
      airline: parsed.data.airline.toUpperCase(),
      base: parsed.data.base.toUpperCase(),
    };
    const found = await findDeployment(intent.airline, intent.crewGroup, reply);
    if (!found) return reply;
    const { airline, deployment } = found;

    const config = DeploymentConfig.safeParse(deployment.config);
    if (!config.success) {
      req.log.error(
        { airline: airline.code, issues: config.error.issues },
        "invalid PbsDeployment.config",
      );
      return reply.code(500).send({ error: "invalid_deployment_config" });
    }

    let bid;
    try {
      bid = compile(intent, deployment.vendor, config.data, deployment.dialect);
    } catch (err) {
      if (err instanceof UnsupportedVendorError) {
        return reply.code(501).send({
          error: "not_implemented",
          todo: `${err.vendor} compiler`,
          vendor: err.vendor,
        });
      }
      throw err;
    }
    if (deployment.confidence !== "CONFIRMED") {
      const basis = deployment.confidence === "INFERRED" ? "inferred" : "from a third-party source";
      bid.warnings.push(
        `${airline.name} ${CREW_NAMES[intent.crewGroup]} on ${deployment.vendor}: ${basis}, not confirmed by the airline or union. Check your bid screen matches before entering.`,
      );
    }

    // Reserve groups don't draw from the pairing pool, so only line bids get counts.
    const period =
      intent.lineType === "LINEHOLDER"
        ? await store.loadPairings(deployment.id, intent.base, intent.month)
        : null;
    const preview = period ? previewPool(bid, period.pairings, period.importedAt) : null;
    return { ...bid, preview } satisfies CompileResponse;
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

  // One bid period's pairings in a Holdline format (docs/pairing-import.md). Replaces any earlier
  // import for the same airline, crew group, base and month.
  app.post("/bid-periods/import", { bodyLimit: IMPORT_BODY_LIMIT }, async (req, reply) => {
    const body = ImportRequest.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: "invalid_request", issues: body.error.issues });
    }
    const request = {
      ...body.data,
      airline: body.data.airline.toUpperCase(),
      base: body.data.base.toUpperCase(),
    };
    const found = await findDeployment(request.airline, request.crewGroup, reply);
    if (!found) return reply;

    const { pairings, errors } = parsePairingFile(request.format, request.data);
    if (pairings.length === 0) return reply.code(422).send({ error: "no_pairings", errors });
    await store.savePairings(found.deployment.id, request.base, request.month, pairings);
    return { imported: pairings.length, errors } satisfies ImportResponse;
  });

  return app;
}
