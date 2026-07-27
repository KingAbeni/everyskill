-- CreateEnum
CREATE TYPE "PricingType" AS ENUM ('HOURLY', 'FIXED');

-- AlterTable
ALTER TABLE "ServiceListing" ADD COLUMN     "pricingType" "PricingType" NOT NULL DEFAULT 'FIXED';
