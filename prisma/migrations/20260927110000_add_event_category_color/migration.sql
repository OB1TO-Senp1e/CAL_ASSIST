-- Adds the Event category/color columns that the calendar domain layer,
-- CalendarService and the client calendar contract already assume.
-- See BUILD_LOG "backend contract mismatches" item 1.

-- CreateEnum
CREATE TYPE "EventCategory" AS ENUM (
  'PERSONAL',
  'WORK',
  'MEETING',
  'APPOINTMENT',
  'REMINDER',
  'HOLIDAY',
  'BIRTHDAY',
  'TRAVEL',
  'FOCUS_TIME',
  'CUSTOM'
);

-- AlterTable
ALTER TABLE "Event" ADD COLUMN "category" "EventCategory" NOT NULL DEFAULT 'PERSONAL';

-- AlterTable
ALTER TABLE "Event" ADD COLUMN "color" TEXT;

-- CreateIndex
CREATE INDEX "Event_category_idx" ON "Event"("category");
