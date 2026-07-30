import { prisma } from "../../config/prisma";
import { notify, NotificationType } from "../notification/notification.service";

/**
 * Finds the highest active tier whose minXp the provider's new total meets, and updates
 * ProviderStats.currentTierId if it changed. Called after every XP award (see xp.service.ts) —
 * this is the only place a provider's tier is ever recalculated.
 */
export async function recalculateTier(providerProfileId: string, totalXp: number) {
  const stats = await prisma.providerStats.findUnique({ where: { providerProfileId } });
  if (!stats) {
    return;
  }

  const newTier = await prisma.tierLevel.findFirst({
    where: { isActive: true, minXp: { lte: totalXp } },
    orderBy: { minXp: "desc" },
  });

  if (!newTier || newTier.id === stats.currentTierId) {
    return;
  }

  await prisma.providerStats.update({ where: { providerProfileId }, data: { currentTierId: newTier.id } });

  const providerProfile = await prisma.providerProfile.findUniqueOrThrow({
    where: { id: providerProfileId },
    select: { userId: true },
  });
  await notify(providerProfile.userId, NotificationType.TIER_UPGRADED, `Congratulations! You've reached the ${newTier.name} tier`);
}
