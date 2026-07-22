import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import { z } from "zod";
import { createCertificationSchema, updateProviderProfileSchema } from "./provider.schemas";

type UpdateProviderProfileInput = z.infer<typeof updateProviderProfileSchema>;
type CreateCertificationInput = z.infer<typeof createCertificationSchema>;

async function getProfileOrThrow(userId: string) {
  const profile = await prisma.providerProfile.findUnique({ where: { userId } });
  if (!profile) {
    throw new AppError(404, "Provider profile not found");
  }
  return profile;
}

export async function getMyProfile(userId: string) {
  const profile = await getProfileOrThrow(userId);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return { ...profile, email: user.email };
}

export async function updateMyProfile(userId: string, input: UpdateProviderProfileInput) {
  const profile = await getProfileOrThrow(userId);
  return prisma.providerProfile.update({
    where: { id: profile.id },
    data: {
      ...input,
      socialLinks: input.socialLinks as Prisma.InputJsonValue | undefined,
      portfolioLinks: input.portfolioLinks as Prisma.InputJsonValue | undefined,
      operatingHours: input.operatingHours as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function listCertifications(userId: string) {
  const profile = await getProfileOrThrow(userId);
  return prisma.certification.findMany({
    where: { providerProfileId: profile.id },
    orderBy: { createdAt: "desc" },
  });
}

export async function createCertification(userId: string, input: CreateCertificationInput) {
  const profile = await getProfileOrThrow(userId);
  return prisma.certification.create({
    data: { ...input, providerProfileId: profile.id },
  });
}

export async function deleteCertification(userId: string, certificationId: string) {
  const profile = await getProfileOrThrow(userId);
  const cert = await prisma.certification.findUnique({ where: { id: certificationId } });
  if (!cert || cert.providerProfileId !== profile.id) {
    throw new AppError(404, "Certification not found");
  }
  await prisma.certification.delete({ where: { id: certificationId } });
}
