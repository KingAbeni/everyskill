import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import { getSignedKycDocumentUrl } from "../../config/supabaseStorage";
import { z } from "zod";
import { listKycQuerySchema, reviewKycSchema } from "./admin.schemas";

type ListKycQuery = z.infer<typeof listKycQuerySchema>;
type ReviewKycInput = z.infer<typeof reviewKycSchema>;

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
