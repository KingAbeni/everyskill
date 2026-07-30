-- CreateEnum
CREATE TYPE "QrTokenKind" AS ENUM ('ARRIVAL', 'COMPLETION');

-- CreateEnum
CREATE TYPE "QrTokenStatus" AS ENUM ('PENDING', 'USED', 'EXPIRED', 'INVALIDATED');

-- CreateEnum
CREATE TYPE "XpReason" AS ENUM ('JOB_COMPLETED', 'FIVE_STAR_REVIEW', 'STREAK_BONUS', 'YEARLY_MILESTONE');

-- AlterEnum
ALTER TYPE "BookingStatus" ADD VALUE 'WAITING_FOR_CONFIRMATION';

-- AlterTable
ALTER TABLE "ServiceListing" ADD COLUMN     "requiresQrVerification" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "BookingQrToken" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "kind" "QrTokenKind" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "QrTokenStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "generatedById" TEXT NOT NULL,
    "usedById" TEXT,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingQrToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderStats" (
    "id" TEXT NOT NULL,
    "providerProfileId" TEXT NOT NULL,
    "totalXp" INTEGER NOT NULL DEFAULT 0,
    "currentTierId" TEXT,
    "completedJobs" INTEGER NOT NULL DEFAULT 0,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "fiveStarReviewCount" INTEGER NOT NULL DEFAULT 0,
    "lastYearlyMilestoneYear" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TierLevel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minXp" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TierLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderXpHistory" (
    "id" TEXT NOT NULL,
    "providerProfileId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" "XpReason" NOT NULL,
    "relatedBookingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderXpHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Achievement" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Achievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderBadge" (
    "id" TEXT NOT NULL,
    "providerProfileId" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderBadge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GamificationSettings" (
    "id" TEXT NOT NULL,
    "xpPerCompletedJob" INTEGER NOT NULL DEFAULT 50,
    "xpPerFiveStarReview" INTEGER NOT NULL DEFAULT 30,
    "xpStreakBonusEvery" INTEGER NOT NULL DEFAULT 5,
    "xpStreakBonusAmount" INTEGER NOT NULL DEFAULT 25,
    "xpPerYearMilestone" INTEGER NOT NULL DEFAULT 100,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GamificationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingQrToken_bookingId_idx" ON "BookingQrToken"("bookingId");

-- CreateIndex
CREATE INDEX "BookingQrToken_tokenHash_idx" ON "BookingQrToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderStats_providerProfileId_key" ON "ProviderStats"("providerProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "TierLevel_name_key" ON "TierLevel"("name");

-- CreateIndex
CREATE UNIQUE INDEX "TierLevel_minXp_key" ON "TierLevel"("minXp");

-- CreateIndex
CREATE UNIQUE INDEX "TierLevel_order_key" ON "TierLevel"("order");

-- CreateIndex
CREATE INDEX "ProviderXpHistory_providerProfileId_idx" ON "ProviderXpHistory"("providerProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "Achievement_code_key" ON "Achievement"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderBadge_providerProfileId_achievementId_key" ON "ProviderBadge"("providerProfileId", "achievementId");

-- AddForeignKey
ALTER TABLE "BookingQrToken" ADD CONSTRAINT "BookingQrToken_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderStats" ADD CONSTRAINT "ProviderStats_providerProfileId_fkey" FOREIGN KEY ("providerProfileId") REFERENCES "ProviderProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderStats" ADD CONSTRAINT "ProviderStats_currentTierId_fkey" FOREIGN KEY ("currentTierId") REFERENCES "TierLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderXpHistory" ADD CONSTRAINT "ProviderXpHistory_providerProfileId_fkey" FOREIGN KEY ("providerProfileId") REFERENCES "ProviderProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderBadge" ADD CONSTRAINT "ProviderBadge_providerProfileId_fkey" FOREIGN KEY ("providerProfileId") REFERENCES "ProviderProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderBadge" ADD CONSTRAINT "ProviderBadge_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "Achievement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
