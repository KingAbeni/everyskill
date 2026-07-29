/*
  Warnings:

  - Changed the type of `targetType` on the `Report` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `reason` on the `Report` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('POOR_QUALITY', 'FRAUD', 'INAPPROPRIATE_BEHAVIOUR', 'FAKE_REVIEW', 'OFFENSIVE_MESSAGE', 'SCAM_PROVIDER', 'INAPPROPRIATE_CONTENT');

-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('USER', 'REVIEW', 'MESSAGE', 'LISTING');

-- CreateEnum
CREATE TYPE "ReportActionType" AS ENUM ('WARN', 'SUSPEND', 'BAN', 'DISMISS');

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "actionTaken" "ReportActionType",
ADD COLUMN     "resolutionNote" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
DROP COLUMN "targetType",
ADD COLUMN     "targetType" "ReportTargetType" NOT NULL,
DROP COLUMN "reason",
ADD COLUMN     "reason" "ReportReason" NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "warningCount" INTEGER NOT NULL DEFAULT 0;
