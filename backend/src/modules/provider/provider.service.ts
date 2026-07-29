import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import { getSignedKycDocumentUrl } from "../../config/supabaseStorage";
import { z } from "zod";
import { createCertificationSchema, submitKycDocumentSchema, updateProviderProfileSchema } from "./provider.schemas";
import * as listingService from "../listing/listing.service";
import * as availabilityService from "../availability/availability.service";
import * as paymentService from "../payment/payment.service";
import * as reviewService from "../review/review.service";
import * as messageService from "../message/message.service";
import * as notificationService from "../notification/notification.service";

const DASHBOARD_RECENT_LIMIT = 5;

type UpdateProviderProfileInput = z.infer<typeof updateProviderProfileSchema>;
type CreateCertificationInput = z.infer<typeof createCertificationSchema>;
type SubmitKycDocumentInput = z.infer<typeof submitKycDocumentSchema>;

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

export async function listKycDocuments(userId: string) {
  const profile = await getProfileOrThrow(userId);
  return prisma.kycVerification.findMany({
    where: { providerProfileId: profile.id },
    orderBy: { createdAt: "desc" },
  });
}

export async function submitKycDocument(userId: string, input: SubmitKycDocumentInput) {
  const profile = await getProfileOrThrow(userId);
  return prisma.kycVerification.create({
    data: { ...input, providerProfileId: profile.id },
  });
}

export async function getKycDocumentUrl(userId: string, kycId: string) {
  const profile = await getProfileOrThrow(userId);
  const kyc = await prisma.kycVerification.findUnique({ where: { id: kycId } });
  if (!kyc || kyc.providerProfileId !== profile.id) {
    throw new AppError(404, "KYC document not found");
  }
  return getSignedKycDocumentUrl(kyc.documentPath);
}

/**
 * FR22 — one aggregation endpoint over the SRS's eight bullets (Profile, Services, Schedule,
 * Bookings, Earnings, Analytics, Reviews, Manage certificates, Verification status), all of which
 * already have their own dedicated endpoint except Analytics. Bookings/payments/withdrawals are
 * capped to the most recent few (same "glance, not a data dump" choice made for FR21); services,
 * schedule, reviews, and certifications are returned in full since they're typically short lists.
 * Analytics is deliberately simple derived counts (not FR25's territory) — total/completed/
 * cancelled bookings plus the same rating aggregate FR16 already computes for listing search.
 */
export async function getDashboard(userId: string) {
  const profile = await getProfileOrThrow(userId);

  const [
    profileSummary,
    services,
    schedule,
    recentBookings,
    bookingStatusCounts,
    balance,
    recentPayments,
    recentWithdrawals,
    pendingBillsCount,
    ratingSummaries,
    reviews,
    certifications,
    kycDocuments,
    recentMessages,
    unread,
  ] = await Promise.all([
    getMyProfile(userId),
    listingService.listMyListings(userId),
    availabilityService.listMySlots(userId),
    prisma.booking.findMany({
      where: { providerProfileId: profile.id },
      include: { listing: true, customer: true, payment: true },
      orderBy: { createdAt: "desc" },
      take: DASHBOARD_RECENT_LIMIT,
    }),
    prisma.booking.groupBy({
      by: ["status"],
      where: { providerProfileId: profile.id },
      _count: { status: true },
    }),
    paymentService.getProviderBalance(userId),
    paymentService.listProviderPayments(userId).then((rows) => rows.slice(0, DASHBOARD_RECENT_LIMIT)),
    paymentService.listWithdrawals(userId).then((rows) => rows.slice(0, DASHBOARD_RECENT_LIMIT)),
    prisma.offlinePaymentBill.count({ where: { providerProfileId: profile.id, status: { in: ["PENDING", "OVERDUE"] } } }),
    reviewService.getProviderRatingSummaries([profile.id]),
    reviewService.listReviewsForMyProvider(userId),
    listCertifications(userId),
    listKycDocuments(userId),
    messageService.listRecentMessagesForProvider(userId),
    notificationService.getUnreadCount(userId),
  ]);

  const countsByStatus = Object.fromEntries(bookingStatusCounts.map((row) => [row.status, row._count.status]));
  const ratingSummary = ratingSummaries.get(profile.id) ?? { averageRating: null, reviewCount: 0 };

  return {
    profile: profileSummary,
    services,
    schedule,
    bookings: { recent: recentBookings, countsByStatus },
    earnings: { balance, recentPayments, recentWithdrawals, pendingBillsCount },
    analytics: {
      totalBookings: bookingStatusCounts.reduce((sum, row) => sum + row._count.status, 0),
      completedBookings: countsByStatus.COMPLETED ?? 0,
      cancelledBookings: countsByStatus.CANCELLED ?? 0,
      averageRating: ratingSummary.averageRating,
      reviewCount: ratingSummary.reviewCount,
    },
    reviews,
    certifications,
    verification: { status: profileSummary.verificationStatus, kycDocuments },
    recentMessages,
    unreadNotificationCount: unread.unreadCount,
  };
}
