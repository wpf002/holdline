import cors from "@fastify/cors";
import { createDb } from "@holdline/db";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { env } from "./env.js";

const db = createDb(env.DATABASE_URL);
const app = Fastify({ logger: true });
await app.register(cors, { origin: env.CORS_ORIGINS });

app.get("/health", async () => ({ ok: true }));

// Vertical slice: real rows from Postgres.
app.get("/airlines", async () =>
  db.airline.findMany({
    orderBy: { name: "asc" },
    include: { deployments: { select: { crewGroup: true, vendor: true, dialect: true, confidence: true } } },
  }),
);

const todo = (what: string) => async (_req: FastifyRequest, reply: FastifyReply) =>
  reply.code(501).send({ error: "not_implemented", todo: what });

app.post("/bids/compile", todo("BidIntent -> CompiledBid via @holdline/core (phase 1)"));
app.post("/bids/parse", todo("plain English -> BidIntent via Anthropic tool use (phase 2)"));
app.post("/bid-periods/import", todo("pairing file parser per airline (phase 3)"));

app.addHook("onClose", async () => db.$disconnect());
await app.listen({ port: env.PORT, host: "0.0.0.0" });
