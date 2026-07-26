/*
  Warnings:

  - You are about to drop the column `documentUrl` on the `KycVerification` table. All the data in the column will be lost.
  - Added the required column `documentPath` to the `KycVerification` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "KycVerification" DROP COLUMN "documentUrl",
ADD COLUMN     "documentPath" TEXT NOT NULL;
