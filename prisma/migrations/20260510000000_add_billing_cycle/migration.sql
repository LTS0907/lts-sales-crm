-- AlterTable: add billingCycle column if not exists (safe for environments where db push was already applied)
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "billingCycle" TEXT NOT NULL DEFAULT 'MONTHLY';
