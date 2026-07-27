import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import { getSignedKycDocumentUrl } from "../../config/supabaseStorage";
import { z } from "zod";
import { createAdminSchema, forceResetAdminPasswordSchema, listKycQuerySchema, reviewKycSchema } from "./admin.schemas";

type ListKycQuery = z.infer<typeof listKycQuerySchema>;
type ReviewKycInput = z.infer<typeof reviewKycSchema>;
type CreateAdminInput = z.infer<typeof createAdminSchema>;
type ForceResetAdminPasswordInput = z.infer<typeof forceResetAdminPasswordSchema>;

export async function listKycRequests(query: ListKycQuery) {
  return prisma.kycVerification.findMany({
    where: query.status ? { status: query.status } : undefined,
    include: { providerProfile: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function reviewKycRequest(adminUserId: string, kycId: string, input: ReviewKycInput) {
  const kyc = await prisma.kycVerification.findUnique({ where: { id: kycId } });
  if (!kyc) {
    throw new AppError(404, "KYC request not found");
  }

  const [updatedKyc] = await prisma.$transaction([
    prisma.kycVerification.update({
      where: { id: kycId },
      data: {
        status: input.status,
        rejectionReason: input.status === "REJECTED" ? input.rejectionReason : null,
        reviewedById: adminUserId,
        reviewedAt: new Date(),
      },
    }),
    prisma.providerProfile.update({
      where: { id: kyc.providerProfileId },
      data: { verificationStatus: input.status },
    }),
    prisma.auditLog.create({
      data: {
        actorId: adminUserId,
        action: "KYC_REVIEW",
        targetType: "KycVerification",
        targetId: kycId,
        metadata: {
          status: input.status,
          rejectionReason: input.rejectionReason ?? null,
        } as Prisma.InputJsonValue,
      },
    }),
  ]);

  return updatedKyc;
}

export async function getKycDocumentUrl(kycId: string) {
  const kyc = await prisma.kycVerification.findUnique({ where: { id: kycId } });
  if (!kyc) {
    throw new AppError(404, "KYC request not found");
  }
  return getSignedKycDocumentUrl(kyc.documentPath);
}

export async function listAdmins() {
  return prisma.user.findMany({
    where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } },
    select: { id: true, email: true, role: true, status: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function createAdmin(actorId: string, input: CreateAdminInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new AppError(409, "An account with this email already exists");
  }

  const passwordHash = await bcrypt.hash(input.password, 10);
  const userId = crypto.randomUUID();

  const [user] = await prisma.$transaction([
    prisma.user.create({
      data: { id: userId, email: input.email, passwordHash, role: input.role, emailVerified: true },
    }),
    prisma.auditLog.create({
      data: {
        actorId,
        action: "ADMIN_ACCOUNT_CREATED",
        targetType: "User",
        targetId: userId,
        metadata: { email: input.email, role: input.role } as Prisma.InputJsonValue,
      },
    }),
  ]);

  return { id: user.id, email: user.email, role: user.role, status: user.status, createdAt: user.createdAt };
}

export async function forceResetAdminPassword(
  actorId: string,
  targetUserId: string,
  input: ForceResetAdminPasswordInput,
) {
  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target || (target.role !== "ADMIN" && target.role !== "SUPER_ADMIN")) {
    throw new AppError(404, "Admin account not found");
  }

  const passwordHash = await bcrypt.hash(input.newPassword, 10);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: targetUserId },
      data: {
        passwordHash,
        refreshTokenHash: null,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
      },
    }),
    prisma.auditLog.create({
      data: {
        actorId,
        action: "ADMIN_PASSWORD_FORCE_RESET",
        targetType: "User",
        targetId: targetUserId,
        metadata: { targetEmail: target.email } as Prisma.InputJsonValue,
      },
    }),
  ]);
}
