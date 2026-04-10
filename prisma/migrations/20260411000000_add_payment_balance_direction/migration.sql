-- AlterTable
ALTER TABLE "PaymentTransaction"
  ADD COLUMN "direction" TEXT NOT NULL DEFAULT 'IN',
  ADD COLUMN "balance" INTEGER,
  ADD COLUMN "description" TEXT;

-- CreateIndex
CREATE INDEX "PaymentTransaction_direction_idx" ON "PaymentTransaction"("direction");
