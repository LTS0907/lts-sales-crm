-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN "minutesActionItems" JSONB,
ADD COLUMN "minutesTasksRegisteredAt" TIMESTAMP(3);
