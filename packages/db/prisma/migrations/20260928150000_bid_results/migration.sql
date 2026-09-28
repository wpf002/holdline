-- CreateTable
CREATE TABLE "BidResult" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "base" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "results" JSONB NOT NULL,
    CONSTRAINT "BidResult_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "BidResult_deploymentId_base_month_key" ON "BidResult"("deploymentId", "base", "month");
-- AddForeignKey
ALTER TABLE "BidResult" ADD CONSTRAINT "BidResult_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "PbsDeployment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
