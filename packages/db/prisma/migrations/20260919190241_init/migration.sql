-- CreateEnum
CREATE TYPE "CrewGroup" AS ENUM ('PILOT', 'FLIGHT_ATTENDANT');

-- CreateEnum
CREATE TYPE "PbsVendor" AS ENUM ('NAVBLUE', 'JEPPESEN', 'IBS_ADOPT', 'AOS', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "BidDialect" AS ENUM ('ORDERED_GROUPS', 'LAYERED', 'WEIGHTED');

-- CreateEnum
CREATE TYPE "SourceConfidence" AS ENUM ('CONFIRMED', 'THIRD_PARTY', 'INFERRED');

-- CreateTable
CREATE TABLE "Airline" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Airline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PbsDeployment" (
    "id" TEXT NOT NULL,
    "airlineId" TEXT NOT NULL,
    "crewGroup" "CrewGroup" NOT NULL,
    "vendor" "PbsVendor" NOT NULL,
    "dialect" "BidDialect" NOT NULL,
    "confidence" "SourceConfidence" NOT NULL,
    "sourceUrl" TEXT,
    "notes" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "PbsDeployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "airlineId" TEXT,
    "crewGroup" "CrewGroup",
    "base" TEXT,
    "seniority" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BidPeriod" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "base" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BidPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pairing" (
    "id" TEXT NOT NULL,
    "bidPeriodId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "days" INTEGER NOT NULL,
    "creditMinutes" INTEGER NOT NULL,
    "tafbMinutes" INTEGER,
    "reportLocal" TEXT,
    "releaseLocal" TEXT,
    "layovers" TEXT[],
    "legs" JSONB NOT NULL DEFAULT '[]',
    "raw" JSONB,

    CONSTRAINT "Pairing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bid" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "intent" JSONB NOT NULL,
    "compiled" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AwardRecord" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "base" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "seniority" INTEGER NOT NULL,
    "pairingNumber" TEXT,
    "lineCredit" INTEGER,
    "raw" JSONB,

    CONSTRAINT "AwardRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Airline_code_key" ON "Airline"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PbsDeployment_airlineId_crewGroup_key" ON "PbsDeployment"("airlineId", "crewGroup");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "BidPeriod_deploymentId_base_month_key" ON "BidPeriod"("deploymentId", "base", "month");

-- CreateIndex
CREATE INDEX "Pairing_bidPeriodId_days_idx" ON "Pairing"("bidPeriodId", "days");

-- CreateIndex
CREATE UNIQUE INDEX "Pairing_bidPeriodId_number_startDate_key" ON "Pairing"("bidPeriodId", "number", "startDate");

-- CreateIndex
CREATE INDEX "AwardRecord_deploymentId_base_month_idx" ON "AwardRecord"("deploymentId", "base", "month");

-- AddForeignKey
ALTER TABLE "PbsDeployment" ADD CONSTRAINT "PbsDeployment_airlineId_fkey" FOREIGN KEY ("airlineId") REFERENCES "Airline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_airlineId_fkey" FOREIGN KEY ("airlineId") REFERENCES "Airline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidPeriod" ADD CONSTRAINT "BidPeriod_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "PbsDeployment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pairing" ADD CONSTRAINT "Pairing_bidPeriodId_fkey" FOREIGN KEY ("bidPeriodId") REFERENCES "BidPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "PbsDeployment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardRecord" ADD CONSTRAINT "AwardRecord_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "PbsDeployment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
