import { prisma } from "../../config/prisma";

export async function getPlatformSettings() {
  const existing = await prisma.platformSettings.findFirst();
  if (existing) {
    return existing;
  }
  return prisma.platformSettings.create({ data: {} });
}

export async function updateCommissionPercent(actorId: string, commissionPercent: number) {
  const settings = await getPlatformSettings();
  return prisma.platformSettings.update({
    where: { id: settings.id },
    data: { commissionPercent, updatedById: actorId },
  });
}
