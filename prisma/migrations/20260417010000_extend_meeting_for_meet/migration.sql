-- Extend Meeting for Google Calendar + Meet + Transcript sync (2026-04-17)

ALTER TABLE "Meeting" ADD COLUMN "duration" INTEGER;
ALTER TABLE "Meeting" ADD COLUMN "googleEventId" TEXT;
ALTER TABLE "Meeting" ADD COLUMN "meetUrl" TEXT;
ALTER TABLE "Meeting" ADD COLUMN "calendarId" TEXT;
ALTER TABLE "Meeting" ADD COLUMN "htmlLink" TEXT;
ALTER TABLE "Meeting" ADD COLUMN "transcriptDriveId" TEXT;
ALTER TABLE "Meeting" ADD COLUMN "recordingDriveId" TEXT;
ALTER TABLE "Meeting" ADD COLUMN "summary" TEXT;
ALTER TABLE "Meeting" ADD COLUMN "summaryAt" TIMESTAMP(3);
ALTER TABLE "Meeting" ADD COLUMN "syncedAt" TIMESTAMP(3);
ALTER TABLE "Meeting" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'SCHEDULED';
ALTER TABLE "Meeting" ADD COLUMN "owner" TEXT NOT NULL DEFAULT 'KAZUI';

CREATE UNIQUE INDEX "Meeting_googleEventId_key" ON "Meeting"("googleEventId");
CREATE INDEX "Meeting_date_idx" ON "Meeting"("date");
CREATE INDEX "Meeting_googleEventId_idx" ON "Meeting"("googleEventId");
CREATE INDEX "Meeting_syncedAt_idx" ON "Meeting"("syncedAt");
