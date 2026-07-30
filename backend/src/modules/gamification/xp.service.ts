import { XpReason } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { recalculateTier } from "./tier.service";

export async function getOrCreateProviderStats(providerProfileId: string) {
  const existing = await prisma.providerStats.findUnique({ where: { providerProfileId } });
  if (existing) {
    return existing;
  }
  return prisma.providerStats.create({ data: { providerProfileId } });
}

/**
 * Writes a ProviderXpHistory row, increments ProviderStats.totalXp, then recalculates the
 * provider's tier — the single place XP is ever granted (booking completion, 5-star reviews,
 * streak bonuses), so tier recalculation can never be forgotten at a call site.
 */
export async function awardXp(
  providerProfileId: string,
  amount: number,
  reason: XpReason,
  relatedBookingId?: string,
) {
  await getOrCreateProviderStats(providerProfileId);
  if (amount <= 0) {
    return prisma.providerStats.findUniqueOrThrow({ where: { providerProfileId } });
  }

  const [stats] = await prisma.$transaction([
    prisma.providerStats.update({ where: { providerProfileId }, data: { totalXp: { increment: amount } } }),
    prisma.providerXpHistory.create({
      data: { providerProfileId, amount, reason, relatedBookingId: relatedBookingId ?? null },
    }),
  ]);

  await recalculateTier(providerProfileId, stats.totalXp);
  return stats;
}

/** Resets a provider's consecutive-completion streak — called whenever a violation is recorded against them. */
export async function resetStreak(providerProfileId: string) {
  await getOrCreateProviderStats(providerProfileId);
  await prisma.providerStats.update({ where: { providerProfileId }, data: { currentStreak: 0 } });
}
