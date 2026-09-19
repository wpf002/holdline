import { createDb } from "@holdline/db";
import { buildApp } from "./app.js";
import { env } from "./env.js";

const db = createDb(env.DATABASE_URL);
const app = await buildApp(
  {
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
  { corsOrigins: env.CORS_ORIGINS, logger: true },
);

app.addHook("onClose", async () => db.$disconnect());
await app.listen({ port: env.PORT, host: "0.0.0.0" });
