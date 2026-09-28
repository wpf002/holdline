import type { HistoryMonth } from "@holdline/core";
import { Prisma, type Db, type Pairing as PairingRow } from "@holdline/db";
import { Award, BidResults, DeploymentConfig, Pairing } from "@holdline/types";
import type { Store } from "./app.js";

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

function toPairing(row: PairingRow): Pairing {
  return Pairing.parse({
    number: row.number,
    startDate: isoDate(row.startDate),
    days: row.days,
    creditMinutes: row.creditMinutes,
    tafbMinutes: row.tafbMinutes ?? undefined,
    report: row.reportLocal ?? undefined,
    release: row.releaseLocal ?? undefined,
    layovers: row.layovers,
    legs: row.legs,
  });
}

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
        pairings: found.pairings.map(toPairing),
        pairingLines: found.pairingLines,
        reserveLines: found.reserveLines,
        creditWindows: DeploymentConfig.shape.creditWindows.safeParse(
          found.creditWindows ?? undefined,
        ).data,
      };
    },

    async saveResults(deploymentId, base, month, results) {
      await db.bidResult.upsert({
        where: { deploymentId_base_month: { deploymentId, base, month } },
        update: { importedAt: new Date(), results },
        create: { deploymentId, base, month, results },
      });
    },
    async loadResults(deploymentId, base, month) {
      const row = await db.bidResult.findFirst({
        where: { deploymentId, base, month: { lt: month } },
        orderBy: { month: "desc" },
      });
      const parsed = row && BidResults.safeParse(row.results);
      if (!row || !parsed?.success) return null;
      return { ...parsed.data, month: row.month, importedAt: row.importedAt.toISOString() };
    },

    async saveAwards(deploymentId, base, month, awards) {
      await db.$transaction([
        db.awardRecord.deleteMany({ where: { deploymentId, base, month } }),
        db.awardRecord.createMany({
          data: awards.map((a) => ({
            deploymentId,
            base,
            month,
            seniority: a.seniority,
            pairingNumber: a.pairingNumber ?? null,
            pairingDate: a.pairingDate ? new Date(`${a.pairingDate}T00:00:00Z`) : null,
            lineCredit: a.lineCreditMinutes ?? null,
            reserve: a.reserve,
          })),
        }),
      ]);
    },

    async loadHistory(deploymentId, base, month, limit) {
      const months = await db.awardRecord.findMany({
        where: { deploymentId, base, month: { lt: month } },
        distinct: ["month"],
        orderBy: { month: "desc" },
        take: limit,
        select: { month: true },
      });
      return Promise.all(
        months.map(async ({ month: past }): Promise<HistoryMonth> => {
          const [awards, bidPeriod] = await Promise.all([
            db.awardRecord.findMany({ where: { deploymentId, base, month: past } }),
            db.bidPeriod.findUnique({
              where: period(deploymentId, base, past),
              include: { pairings: true },
            }),
          ]);
          return {
            month: past,
            pairings: bidPeriod?.pairings.map(toPairing) ?? [],
            awards: awards.map((row) =>
              Award.parse({
                seniority: row.seniority,
                pairingNumber: row.pairingNumber ?? undefined,
                pairingDate: row.pairingDate ? isoDate(row.pairingDate) : undefined,
                lineCreditMinutes: row.lineCredit ?? undefined,
                reserve: row.reserve,
              }),
            ),
          };
        }),
      );
    },

    async savePairings(deploymentId, base, month, pairings, lines) {
      await db.$transaction(async (tx) => {
        const counts = {
          pairingLines: lines?.pairingLines ?? null,
          reserveLines: lines?.reserveLines ?? null,
          // Prisma wants JsonNull rather than null to clear a JSON column.
          creditWindows: (lines?.creditWindows ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        };
        const { id } = await tx.bidPeriod.upsert({
          where: period(deploymentId, base, month),
          update: { importedAt: new Date(), ...counts },
          create: { deploymentId, base, month, ...counts },
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
