-- CreateTable
CREATE TABLE "BackupLog" (
    "id" TEXT NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sheetsOk" BOOLEAN NOT NULL DEFAULT false,
    "githubOk" BOOLEAN NOT NULL DEFAULT false,
    "driveDumpUrl" TEXT,
    "tableCounts" JSONB,
    "errors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "BackupLog_pkey" PRIMARY KEY ("id")
);
