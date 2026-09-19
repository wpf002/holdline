// Vendor map from public sources, Sept 2026. See docs/pbs-research.md.
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client.js";

config({ path: "../../.env", quiet: true });
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

type Row = [code: string, name: string, crew: "PILOT" | "FLIGHT_ATTENDANT", vendor: "NAVBLUE" | "JEPPESEN" | "IBS_ADOPT" | "AOS" | "UNKNOWN", conf: "CONFIRMED" | "THIRD_PARTY" | "INFERRED", notes?: string];
const dialectOf = { NAVBLUE: "ORDERED_GROUPS", JEPPESEN: "ORDERED_GROUPS", AOS: "LAYERED", IBS_ADOPT: "WEIGHTED", UNKNOWN: "LAYERED" } as const;

const rows: Row[] = [
  ["DAL", "Delta Air Lines", "PILOT", "NAVBLUE", "CONFIRMED"],
  ["DAL", "Delta Air Lines", "FLIGHT_ATTENDANT", "NAVBLUE", "THIRD_PARTY"],
  ["UAL", "United Airlines", "PILOT", "JEPPESEN", "CONFIRMED"],
  ["AAL", "American Airlines", "PILOT", "UNKNOWN", "INFERRED", "7-layer model; vendor unnamed publicly"],
  ["AAL", "American Airlines", "FLIGHT_ATTENDANT", "UNKNOWN", "INFERRED", "7-layer model; APFA guide"],
  ["JBU", "JetBlue", "PILOT", "NAVBLUE", "CONFIRMED"],
  ["ASA", "Alaska Airlines", "PILOT", "NAVBLUE", "CONFIRMED"],
  ["ASA", "Alaska Airlines", "FLIGHT_ATTENDANT", "NAVBLUE", "CONFIRMED"],
  ["HAL", "Hawaiian Airlines", "PILOT", "NAVBLUE", "THIRD_PARTY"],
  ["FFT", "Frontier Airlines", "PILOT", "NAVBLUE", "THIRD_PARTY"],
  ["NKS", "Spirit Airlines", "PILOT", "NAVBLUE", "THIRD_PARTY"],
  ["AAY", "Allegiant Air", "FLIGHT_ATTENDANT", "NAVBLUE", "CONFIRMED"],
  ["GJS", "GoJet Airlines", "PILOT", "NAVBLUE", "THIRD_PARTY"],
  ["ENY", "Envoy Air", "PILOT", "NAVBLUE", "THIRD_PARTY", "PBS new 2025-26"],
  ["ENY", "Envoy Air", "FLIGHT_ATTENDANT", "NAVBLUE", "CONFIRMED", "PBS new 2025-26"],
  ["PDT", "Piedmont Airlines", "PILOT", "NAVBLUE", "THIRD_PARTY", "PBS LOAs ratified 2025"],
  ["PDT", "Piedmont Airlines", "FLIGHT_ATTENDANT", "NAVBLUE", "THIRD_PARTY"],
  ["JIA", "PSA Airlines", "PILOT", "IBS_ADOPT", "CONFIRMED"],
  ["EDV", "Endeavor Air", "PILOT", "IBS_ADOPT", "CONFIRMED"],
  ["RPA", "Republic Airways", "PILOT", "IBS_ADOPT", "CONFIRMED", "Selected Oct 2024"],
  ["SKW", "SkyWest Airlines", "PILOT", "AOS", "INFERRED"],
  ["FDX", "FedEx Express", "PILOT", "IBS_ADOPT", "CONFIRMED"],
  ["ACA", "Air Canada", "PILOT", "IBS_ADOPT", "CONFIRMED"],
  ["ACA", "Air Canada", "FLIGHT_ATTENDANT", "NAVBLUE", "CONFIRMED"],
  ["WJA", "WestJet", "PILOT", "IBS_ADOPT", "CONFIRMED"],
];

for (const [code, name, crewGroup, vendor, confidence, notes] of rows) {
  const airline = await prisma.airline.upsert({ where: { code }, update: { name }, create: { code, name } });
  await prisma.pbsDeployment.upsert({
    where: { airlineId_crewGroup: { airlineId: airline.id, crewGroup } },
    update: { vendor, dialect: dialectOf[vendor], confidence, notes: notes ?? null },
    create: { airlineId: airline.id, crewGroup, vendor, dialect: dialectOf[vendor], confidence, notes: notes ?? null },
  });
}
console.log(`seeded ${rows.length} deployments`);
await prisma.$disconnect();
