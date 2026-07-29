/*
  Warnings:

  - Added the required column `uploadedById` to the `ServiceDocumentation` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `kind` on the `ServiceDocumentation` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "DocumentationKind" AS ENUM ('BEFORE', 'COMPLETION', 'AFTER');

-- AlterTable
ALTER TABLE "ServiceDocumentation" ADD COLUMN     "uploadedById" TEXT NOT NULL,
DROP COLUMN "kind",
ADD COLUMN     "kind" "DocumentationKind" NOT NULL;

-- AddForeignKey
ALTER TABLE "ServiceDocumentation" ADD CONSTRAINT "ServiceDocumentation_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
