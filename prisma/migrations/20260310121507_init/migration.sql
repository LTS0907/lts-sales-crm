-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "name" TEXT NOT NULL,
    "nameKana" TEXT,
    "company" TEXT,
    "department" TEXT,
    "title" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "lineId" TEXT,
    "gmailAlias" TEXT,
    "website" TEXT,
    "address" TEXT,
    "photoPath" TEXT,
    "episodeMemo" TEXT,
    "contactSummary" TEXT,
    "contactSummaryAt" DATETIME,
    "companySummary" TEXT,
    "companySummaryAt" DATETIME,
    "recommendedServices" TEXT,
    "serviceReason" TEXT,
    "emailSubject" TEXT,
    "emailBody" TEXT,
    "emailStatus" TEXT NOT NULL DEFAULT 'UNSENT',
    "emailSentAt" DATETIME,
    "followUpText" TEXT,
    "followUpStatus" TEXT NOT NULL DEFAULT 'NOT_SET',
    "followUpDate" DATETIME,
    "salesPhase" TEXT NOT NULL DEFAULT 'LEAD',
    "nextAction" TEXT,
    "touchNumber" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "ServicePhase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contactId" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ServicePhase_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "contactId" TEXT NOT NULL,
    CONSTRAINT "Note_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Exchange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    CONSTRAINT "Exchange_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT,
    "date" DATETIME NOT NULL,
    "location" TEXT,
    "notes" TEXT
);

-- CreateTable
CREATE TABLE "MeetingParticipant" (
    "meetingId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,

    PRIMARY KEY ("meetingId", "contactId"),
    CONSTRAINT "MeetingParticipant_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MeetingParticipant_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'CUSTOM'
);

-- CreateTable
CREATE TABLE "GroupMember" (
    "groupId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "consentGiven" BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY ("groupId", "contactId"),
    CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GroupMember_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FollowUpLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contactId" TEXT NOT NULL,
    "touchNumber" INTEGER NOT NULL,
    "subject" TEXT,
    "body" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFTED',
    "sentAt" DATETIME,
    CONSTRAINT "FollowUpLog_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ServicePhase_contactId_service_key" ON "ServicePhase"("contactId", "service");
