-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "appliedPromotionId" TEXT,
ADD COLUMN     "originalPrice" DECIMAL(65,30);

-- AlterTable
ALTER TABLE "Promotion" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "maxRedemptions" INTEGER,
ADD COLUMN     "timesRedeemed" INTEGER NOT NULL DEFAULT 0;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_appliedPromotionId_fkey" FOREIGN KEY ("appliedPromotionId") REFERENCES "Promotion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
