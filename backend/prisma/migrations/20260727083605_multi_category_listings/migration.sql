/*
  Warnings:

  - You are about to drop the column `categoryId` on the `ServiceListing` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "ServiceListing" DROP CONSTRAINT "ServiceListing_categoryId_fkey";

-- AlterTable
ALTER TABLE "ServiceListing" DROP COLUMN "categoryId";

-- CreateTable
CREATE TABLE "_ListingCategories" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_ListingCategories_AB_unique" ON "_ListingCategories"("A", "B");

-- CreateIndex
CREATE INDEX "_ListingCategories_B_index" ON "_ListingCategories"("B");

-- AddForeignKey
ALTER TABLE "_ListingCategories" ADD CONSTRAINT "_ListingCategories_A_fkey" FOREIGN KEY ("A") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ListingCategories" ADD CONSTRAINT "_ListingCategories_B_fkey" FOREIGN KEY ("B") REFERENCES "ServiceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
