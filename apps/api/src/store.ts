import type { Db } from "@holdline/db";
import { Pairing } from "@holdline/types";
import type { Store } from "./app.js";

/** Store backed by Postgres through Prisma. */
export function prismaStore(db: Db): Store {
  const period = (deploymentId: string, base: string, month: string) => ({
    deploymentId_base_month: { deploymentId, base, month },
  });

  return {
    listAirlines: () =>
      db.airline.findMany({ orderBy: { name: "asc" }, include: { deployments: true } }),

    findAirline: (code) =>
      db.airline.findUnique({ where: { code }, include: { deployments: true } }),

    async loadPairings(deploymentId, base, month) {
      const found = await db.bidPeriod.findUnique({
        where: period(deploymentId, base, month),
        include: { pairings: { orderBy: [{ startDate: "asc" }, { number: "asc" }] } },
      });
      if (!found) return null;
      return {
        importedAt: found.importedAt,
        pairings: found.pairings.map((row) =>
          Pairing.parse({
            number: row.number,
            startDate: row.startDate.toISOString().slice(0, 10),
            days: row.days,
            creditMinutes: row.creditMinutes,
            tafbMinutes: row.tafbMinutes ?? undefined,
            report: row.reportLocal ?? undefined,
            release: row.releaseLocal ?? undefined,
            layovers: row.layovers,
            legs: row.legs,
          }),
        ),
      };
    },

    async savePairings(deploymentId, base, month, pairings) {
      await db.$transaction(async (tx) => {
        const { id } = await tx.bidPeriod.upsert({
          where: period(deploymentId, base, month),
          update: { importedAt: new Date() },
          create: { deploymentId, base, month },
        });
        await tx.pairing.deleteMany({ where: { bidPeriodId: id } });
        await tx.pairing.createMany({
          data: pairings.map((p) => ({
            bidPeriodId: id,
            number: p.number,
            startDate: new Date(`${p.startDate}T00:00:00Z`),
            days: p.days,
            creditMinutes: p.creditMinutes,
            tafbMinutes: p.tafbMinutes ?? null,
            reportLocal: p.report ?? null,
            releaseLocal: p.release ?? null,
            layovers: p.layovers,
            legs: p.legs,
          })),
        });
      });
    },
  };
}
