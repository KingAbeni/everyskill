-- AlterEnum
ALTER TYPE "ReportTargetType" ADD VALUE 'DOCUMENTATION';

-- DropForeignKey
ALTER TABLE "Report" DROP CONSTRAINT "Report_reporterId_fkey";

-- AlterTable
ALTER TABLE "Report" ALTER COLUMN "reporterId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ServiceListing" ADD COLUMN     "requiresDocumentation" BOOLEAN NOT NULL DEFAULT true;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
