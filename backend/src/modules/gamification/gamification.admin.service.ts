import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import { z } from "zod";
import {
  createAchievementSchema,
  createTierSchema,
  listQrAuditQuerySchema,
  updateAchievementSchema,
  updateGamificationSettingsSchema,
  updateTierSchema,
} from "./gamification.schemas";
import { getGamificationSettings, updateGamificationSettings } from "./gamificationSettings.service";
import { getProviderRatingSummaries } from "../review/review.service";

type CreateTierInput = z.infer<typeof createTierSchema>;
type UpdateTierInput = z.infer<typeof updateTierSchema>;
type CreateAchievementInput = z.infer<typeof createAchievementSchema>;
type UpdateAchievementInput = z.infer<typeof updateAchievementSchema>;
type UpdateGamificationSettingsInput = z.infer<typeof updateGamificationSettingsSchema>;
type ListQrAuditQuery = z.infer<typeof listQrAuditQuerySchema>;

export { getGamificationSettings, updateGamificationSettings };

// ---------- Tier management ("change tier name and create new tier") ----------

export async function listTiers() {
  return prisma.tierLevel.findMany({ orderBy: { order: "asc" } });
}

export async function createTier(input: CreateTierInput) {
  const [nameClash, xpClash, orderClash] = await Promise.all([
    prisma.tierLevel.findUnique({ where: { name: input.name } }),
    prisma.tierLevel.findUnique({ where: { minXp: input.minXp } }),
    prisma.tierLevel.findUnique({ where: { order: input.order } }),
  ]);
  if (nameClash) throw new AppError(409, "A tier with this name already exists");
  if (xpClash) throw new AppError(409, "A tier with this minXp already exists");
  if (orderClash) throw new AppError(409, "A tier with this order already exists");

  return prisma.tierLevel.create({ data: input });
}

export async function updateTier(tierId: string, input: UpdateTierInput) {
  const tier = await prisma.tierLevel.findUnique({ where: { id: tierId } });
  if (!tier) {
    throw new AppError(404, "Tier not found");
  }
  return prisma.tierLevel.update({ where: { id: tierId }, data: input });
}

// ---------- Achievement management ----------

export async function listAchievements() {
  return prisma.achievement.findMany({ orderBy: { createdAt: "asc" } });
}

export async function createAchievement(input: CreateAchievementInput) {
  const existing = await prisma.achievement.findUnique({ where: { code: input.code } });
  if (existing) {
    throw new AppError(409, "An achievement with this code already exists");
  }
  return prisma.achievement.create({ data: input });
}

export async function updateAchievement(achievementId: string, input: UpdateAchievementInput) {
  const achievement = await prisma.achievement.findUnique({ where: { id: achievementId } });
  if (!achievement) {
    throw new AppError(404, "Achievement not found");
  }
  return prisma.achievement.update({ where: { id: achievementId }, data: input });
}

// ---------- Provider progression report ----------

/**
 * Same shape/reuse discipline as admin.reports.service.ts's getProviderPerformanceReport — reuses
 * getProviderRatingSummaries rather than recomputing rating, and joins in gamification state
 * (tier, XP, streak, badge count) per provider.
 */
export async function getProviderProgressionReport() {
  const providers = await prisma.providerProfile.findMany({ select: { id: true, displayName: true, createdAt: true } });
  const providerIds = providers.map((p) => p.id);

  const [stats, tiers, ratingSummaries, badgeCounts] = await Promise.all([
    prisma.providerStats.findMany({ where: { providerProfileId: { in: providerIds } } }),
    prisma.tierLevel.findMany(),
    getProviderRatingSummaries(providerIds),
    prisma.providerBadge.groupBy({ by: ["providerProfileId"], where: { providerProfileId: { in: providerIds } }, _count: { id: true } }),
  ]);

  const statsByProvider = new Map(stats.map((s) => [s.providerProfileId, s]));
  const tierById = new Map(tiers.map((t) => [t.id, t]));
  const badgeCountByProvider = new Map(badgeCounts.map((b) => [b.providerProfileId, b._count.id]));

  const rows = providers.map((provider) => {
    const s = statsByProvider.get(provider.id);
    const tier = s?.currentTierId ? (tierById.get(s.currentTierId) ?? null) : null;
    const rating = ratingSummaries.get(provider.id) ?? { averageRating: null, reviewCount: 0 };
    return {
      providerProfileId: provider.id,
      displayName: provider.displayName,
      memberSince: provider.createdAt,
      totalXp: s?.totalXp ?? 0,
      currentTier: tier?.name ?? null,
      completedJobs: s?.completedJobs ?? 0,
      currentStreak: s?.currentStreak ?? 0,
      longestStreak: s?.longestStreak ?? 0,
      badgeCount: badgeCountByProvider.get(provider.id) ?? 0,
      averageRating: rating.averageRating,
      reviewCount: rating.reviewCount,
    };
  });

  rows.sort((a, b) => b.totalXp - a.totalXp);
  return { providers: rows };
}

// ---------- QR verification audit ----------

/**
 * QR verification history/audit — BookingQrToken rows already carry status/timestamps/actors, so
 * no separate audit table is needed; this just queries them with optional filters.
 */
export async function listQrVerificationHistory(query: ListQrAuditQuery) {
  return prisma.bookingQrToken.findMany({
    where: {
      bookingId: query.bookingId,
      booking: query.providerProfileId ? { providerProfileId: query.providerProfileId } : undefined,
    },
    include: { booking: { select: { id: true, providerProfileId: true, customerId: true, status: true } } },
    orderBy: { createdAt: "desc" },
  });
}
