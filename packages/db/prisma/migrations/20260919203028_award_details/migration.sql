-- AlterTable
ALTER TABLE "AwardRecord" ADD COLUMN     "pairingDate" DATE,
ADD COLUMN     "reserve" BOOLEAN NOT NULL DEFAULT false;
