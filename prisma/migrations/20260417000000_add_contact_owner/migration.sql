-- Add owner field to Contact (2026-04-17)
-- Values: "KAZUI" (龍竹) | "KABASHIMA" (樺嶋) | "SHARED" (共同)

ALTER TABLE "Contact" ADD COLUMN "owner" TEXT NOT NULL DEFAULT 'KAZUI';

-- Index for owner-based filtering
CREATE INDEX "Contact_owner_idx" ON "Contact"("owner");
