import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import { getProviderRatingSummaries } from "../review/review.service";
import { getOrCreateProviderStats } from "./xp.service";

async function getProviderProfileOrThrow(providerProfileId: string) {
  const profile = await prisma.providerProfile.findUnique({ where: { id: providerProfileId } });
  if (!profile) {
    throw new AppError(404, "Provider not found");
  }
  return profile;
}

/**
 * Public provider gamification summary: tier, XP, badges, streak, tenure, rating, success rate.
 * Reuses getProviderRatingSummaries (review.service.ts) rather than recomputing rating — same
 * batched-summary function FR9/FR16 already rely on.
 */
export async function getProviderStats(providerProfileId: string) {
  const profile = await getProviderProfileOrThrow(providerProfileId);
  const [stats, tiers, ratingSummaries, badgeCount] = await Promise.all([
    getOrCreateProviderStats(providerProfileId),
    prisma.tierLevel.findMany({ where: { isActive: true }, orderBy: { order: "asc" } }),
    getProviderRatingSummaries([providerProfileId]),
    prisma.providerBadge.count({ where: { providerProfileId } }),
  ]);

  const currentTier = tiers.find((t) => t.id === stats.currentTierId) ?? tiers[0] ?? null;
  const nextTier = currentTier ? (tiers.find((t) => t.order === currentTier.order + 1) ?? null) : null;
  const rating = ratingSummaries.get(providerProfileId) ?? { averageRating: null, reviewCount: 0 };

  // Calendar-year subtraction, matching the "joined 2022, current year 2026 -> 4 years" example
  // given for the display label — not an elapsed-365-day count (that's used for the YEAR_1/YEAR_5
  // achievement thresholds instead, see achievement.service.ts).
  const yearsOnPlatform = new Date().getUTCFullYear() - profile.createdAt.getUTCFullYear();

  const violationCount = profile.lateCancellationCount + profile.noShowCount;
  const successRateDenominator = stats.completedJobs + violationCount;
  const successRate =
    successRateDenominator > 0 ? Math.round((stats.completedJobs / successRateDenominator) * 1000) / 10 : null;

  return {
    providerProfileId,
    memberSince: profile.createdAt,
    yearsOnPlatform,
    memberForLabel: `Member for ${yearsOnPlatform} year${yearsOnPlatform === 1 ? "" : "s"}`,
    totalXp: stats.totalXp,
    currentTier: currentTier ? { id: currentTier.id, name: currentTier.name, minXp: currentTier.minXp } : null,
    nextTier: nextTier
      ? { id: nextTier.id, name: nextTier.name, minXp: nextTier.minXp, xpNeeded: Math.max(0, nextTier.minXp - stats.totalXp) }
      : null,
    completedJobs: stats.completedJobs,
    currentStreak: stats.currentStreak,
    longestStreak: stats.longestStreak,
    successRate,
    averageRating: rating.averageRating,
    reviewCount: rating.reviewCount,
    badgeCount,
  };
}

export async function getProviderAchievements(providerProfileId: string) {
  await getProviderProfileOrThrow(providerProfileId);
  return prisma.providerBadge.findMany({
    where: { providerProfileId },
    include: { achievement: true },
    orderBy: { earnedAt: "desc" },
  });
}

export async function getMyXpHistory(userId: string) {
  const profile = await prisma.providerProfile.findUnique({ where: { userId } });
  if (!profile) {
    throw new AppError(404, "Provider profile not found");
  }
  return prisma.providerXpHistory.findMany({
    where: { providerProfileId: profile.id },
    orderBy: { createdAt: "desc" },
  });
}
