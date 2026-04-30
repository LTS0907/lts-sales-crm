-- AlterTable: add back-side card image to Contact
ALTER TABLE "Contact" ADD COLUMN "cardImageBackUrl" TEXT;

-- CreateTable: ContactCardHistory
CREATE TABLE "ContactCardHistory" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT,
    "nameKana" TEXT,
    "company" TEXT,
    "department" TEXT,
    "title" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "address" TEXT,
    "cardImageUrl" TEXT,
    "cardImageBackUrl" TEXT,
    "reason" TEXT,

    CONSTRAINT "ContactCardHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContactCardHistory_contactId_scannedAt_idx" ON "ContactCardHistory"("contactId", "scannedAt");

ALTER TABLE "ContactCardHistory" ADD CONSTRAINT "ContactCardHistory_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
