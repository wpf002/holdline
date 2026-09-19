import Anthropic from "@anthropic-ai/sdk";
import { createDb } from "@holdline/db";
import { buildApp } from "./app.js";
import { env } from "./env.js";
import { createParser } from "./parse.js";

const db = createDb(env.DATABASE_URL);
const anthropic = env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 30_000, maxRetries: 1 })
  : null;

const app = await buildApp(
  {
    store: {
      listAirlines: () =>
        db.airline.findMany({
          orderBy: { name: "asc" },
          include: {
            deployments: {
              select: { crewGroup: true, vendor: true, dialect: true, confidence: true },
            },
          },
        }),
      findAirline: (code) =>
        db.airline.findUnique({ where: { code }, include: { deployments: true } }),
    },
    parser: anthropic
      ? createParser((params) => anthropic.messages.create(params), env.ANTHROPIC_MODEL)
      : undefined,
  },
  { corsOrigins: env.CORS_ORIGINS, logger: true },
);

app.addHook("onClose", async () => db.$disconnect());
await app.listen({ port: env.PORT, host: "0.0.0.0" });
