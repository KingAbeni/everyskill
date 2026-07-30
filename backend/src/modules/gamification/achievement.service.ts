import { prisma } from "../../config/prisma";
import { notify, NotificationType } from "../notification/notification.service";

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

async function awardIfNotAlready(providerProfileId: string, code: string) {
  const achievement = await prisma.achievement.findUnique({ where: { code } });
  if (!achievement || !achievement.isActive) {
    return;
  }
  const existing = await prisma.providerBadge.findUnique({
    where: { providerProfileId_achievementId: { providerProfileId, achievementId: achievement.id } },
  });
  if (existing) {
    return;
  }

  await prisma.providerBadge.create({ data: { providerProfileId, achievementId: achievement.id } });

  const providerProfile = await prisma.providerProfile.findUniqueOrThrow({
    where: { id: providerProfileId },
    select: { userId: true },
  });
  await notify(providerProfile.userId, NotificationType.ACHIEVEMENT_EARNED, `New achievement unlocked: ${achievement.name}`);
}

/**
 * Runs the 6 deterministic, instant-check threshold badges (FIRST_JOB, JOBS_50/100/500,
 * YEAR_1/5, FIVE_STAR_100) against a provider's current stats. "Perfect Month" and "Top Provider"
 * are deliberately not implemented here — both need a recurring ranking/time-window job rather
 * than an instant per-event check, and were scoped out for this pass (see plan's Future Work).
 * Idempotent — ProviderBadge's unique constraint means re-running this after an unrelated event
 * never double-awards.
 */
export async function checkAndAwardAchievements(providerProfileId: string) {
  const [stats, providerProfile] = await Promise.all([
    prisma.providerStats.findUnique({ where: { providerProfileId } }),
    prisma.providerProfile.findUnique({ where: { id: providerProfileId }, select: { createdAt: true } }),
  ]);
  if (!stats || !providerProfile) {
    return;
  }

  if (stats.completedJobs >= 1) await awardIfNotAlready(providerProfileId, "FIRST_JOB");
  if (stats.completedJobs >= 50) await awardIfNotAlready(providerProfileId, "JOBS_50");
  if (stats.completedJobs >= 100) await awardIfNotAlready(providerProfileId, "JOBS_100");
  if (stats.completedJobs >= 500) await awardIfNotAlready(providerProfileId, "JOBS_500");
  if (stats.fiveStarReviewCount >= 100) await awardIfNotAlready(providerProfileId, "FIVE_STAR_100");

  const yearsElapsed = (Date.now() - providerProfile.createdAt.getTime()) / YEAR_MS;
  if (yearsElapsed >= 1) await awardIfNotAlready(providerProfileId, "YEAR_1");
  if (yearsElapsed >= 5) await awardIfNotAlready(providerProfileId, "YEAR_5");
}
