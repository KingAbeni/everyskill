import { prisma } from "../../config/prisma";

/** Singleton row, same pattern as platform.service.ts's getPlatformSettings(). */
export async function getGamificationSettings() {
  const existing = await prisma.gamificationSettings.findFirst();
  if (existing) {
    return existing;
  }
  return prisma.gamificationSettings.create({ data: {} });
}

export async function updateGamificationSettings(
  actorId: string,
  input: Partial<{
    xpPerCompletedJob: number;
    xpPerFiveStarReview: number;
    xpStreakBonusEvery: number;
    xpStreakBonusAmount: number;
    xpPerYearMilestone: number;
  }>,
) {
  const settings = await getGamificationSettings();
  return prisma.gamificationSettings.update({
    where: { id: settings.id },
    data: { ...input, updatedById: actorId },
  });
}
