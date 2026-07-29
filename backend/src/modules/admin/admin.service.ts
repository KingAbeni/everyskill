import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import { getSignedKycDocumentUrl } from "../../config/supabaseStorage";
import { z } from "zod";
import {
  createAdminSchema,
  forceResetAdminPasswordSchema,
  listAuditLogQuerySchema,
  listKycQuerySchema,
  listUsersQuerySchema,
  reviewKycSchema,
} from "./admin.schemas";
import { notify, NotificationType } from "../notification/notification.service";
import { getPlatformSettings } from "../platform/platform.service";

type ListKycQuery = z.infer<typeof listKycQuerySchema>;
type ReviewKycInput = z.infer<typeof reviewKycSchema>;
type CreateAdminInput = z.infer<typeof createAdminSchema>;
type ForceResetAdminPasswordInput = z.infer<typeof forceResetAdminPasswordSchema>;
type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
type ListAuditLogQuery = z.infer<typeof listAuditLogQuerySchema>;

const ADMIN_RECENT_LIMIT = 5;
const AUDIT_LOG_LIMIT = 100;

const userSummarySelect = {
  id: true,
  email: true,
  role: true,
  status: true,
  warningCount: true,
  emailVerified: true,
  createdAt: true,
  customerProfile: { select: { firstName: true, lastName: true } },
  providerProfile: { select: { displayName: true, verificationStatus: true } },
} as const;

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
  const providerProfile = await prisma.providerProfile.findUniqueOrThrow({
    where: { id: kyc.providerProfileId },
    select: { userId: true },
  });

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

  await notify(
    providerProfile.userId,
    NotificationType.KYC_REVIEWED,
    input.status === "VERIFIED"
      ? "Your KYC verification was approved"
      : `Your KYC verification was rejected: ${input.rejectionReason ?? "no reason given"}`,
  );

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

/**
 * Manually lifts a SUSPENDED account (FR13 violation-based suspensions have no automatic
 * reinstatement path, unlike FR12's offline-billing suspension which reactivates itself once
 * bills are paid). Also usable as a general override for any suspension, since User.status
 * doesn't track *why* an account was suspended.
 */
export async function reactivateUser(actorId: string, targetUserId: string) {
  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target) {
    throw new AppError(404, "User not found");
  }
  if (target.status !== "SUSPENDED") {
    throw new AppError(409, `Cannot reactivate a user with status ${target.status}`);
  }

  const [updated] = await prisma.$transaction([
    prisma.user.update({ where: { id: targetUserId }, data: { status: "ACTIVE" } }),
    prisma.auditLog.create({
      data: {
        actorId,
        action: "USER_REACTIVATED",
        targetType: "User",
        targetId: targetUserId,
        metadata: { targetEmail: target.email } as Prisma.InputJsonValue,
      },
    }),
  ]);

  await notify(targetUserId, NotificationType.ACCOUNT_REACTIVATED, "Your account has been reactivated by an administrator");

  return { id: updated.id, email: updated.email, role: updated.role, status: updated.status };
}

// ---------- FR23 — Administrator Dashboard ----------

/** All accounts (any role), for admin oversight — no more PII than KYC review already exposes. */
export async function listUsers(query: ListUsersQuery) {
  return prisma.user.findMany({
    where: { role: query.role, status: query.status },
    select: userSummarySelect,
    orderBy: { createdAt: "desc" },
  });
}

export async function listReviewsForAdmin() {
  return prisma.review.findMany({
    include: {
      customer: { select: { firstName: true, lastName: true } },
      providerProfile: { select: { id: true, displayName: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** Capped at AUDIT_LOG_LIMIT — this is a growing log, unlike this codebase's other "list mine" resources. */
export async function listAuditLog(query: ListAuditLogQuery) {
  return prisma.auditLog.findMany({
    where: { action: query.action, targetType: query.targetType },
    include: { actor: { select: { id: true, email: true, role: true } } },
    orderBy: { createdAt: "desc" },
    take: AUDIT_LOG_LIMIT,
  });
}

/**
 * Platform-wide counts. `revenue.estimatedCommissionCollected` is an approximation — Payment
 * only stores the gross amount, not the commission actually taken at capture time, so this
 * recomputes using the *current* commission percent (see platform.service.ts). If the commission
 * percent has ever changed, historical payments are misrepresented by this estimate — documented
 * honestly rather than silently presented as exact.
 */
export async function getPlatformAnalytics() {
  const [usersByRole, usersByStatus, bookingsByStatus, reportsByStatus, disputesByStatus, releasedPayments, reviewAgg, settings] =
    await Promise.all([
      prisma.user.groupBy({ by: ["role"], _count: { role: true } }),
      prisma.user.groupBy({ by: ["status"], _count: { status: true } }),
      prisma.booking.groupBy({ by: ["status"], _count: { status: true } }),
      prisma.report.groupBy({ by: ["status"], _count: { status: true } }),
      prisma.dispute.groupBy({ by: ["status"], _count: { status: true } }),
      prisma.payment.aggregate({ where: { status: "RELEASED" }, _sum: { amount: true }, _count: { _all: true } }),
      prisma.review.aggregate({ _avg: { rating: true }, _count: { rating: true } }),
      getPlatformSettings(),
    ]);

  const grossReleasedPaymentVolume = Number(releasedPayments._sum.amount ?? 0);
  const commissionPercent = Number(settings.commissionPercent);
  const estimatedCommissionCollected = Math.round(grossReleasedPaymentVolume * (commissionPercent / 100) * 100) / 100;

  return {
    users: {
      total: usersByRole.reduce((sum, row) => sum + row._count.role, 0),
      byRole: Object.fromEntries(usersByRole.map((row) => [row.role, row._count.role])),
      byStatus: Object.fromEntries(usersByStatus.map((row) => [row.status, row._count.status])),
    },
    bookings: {
      total: bookingsByStatus.reduce((sum, row) => sum + row._count.status, 0),
      byStatus: Object.fromEntries(bookingsByStatus.map((row) => [row.status, row._count.status])),
    },
    revenue: {
      grossReleasedPaymentVolume,
      estimatedCommissionCollected,
      releasedPaymentCount: releasedPayments._count._all,
    },
    reports: {
      total: reportsByStatus.reduce((sum, row) => sum + row._count.status, 0),
      byStatus: Object.fromEntries(reportsByStatus.map((row) => [row.status, row._count.status])),
    },
    disputes: {
      total: disputesByStatus.reduce((sum, row) => sum + row._count.status, 0),
      byStatus: Object.fromEntries(disputesByStatus.map((row) => [row.status, row._count.status])),
    },
    reviews: {
      total: reviewAgg._count.rating,
      averageRating: reviewAgg._avg.rating !== null ? Math.round(reviewAgg._avg.rating * 10) / 10 : null,
    },
  };
}

/**
 * One aggregation over FR23's eight bullets (Users, Verification, Reviews, Categories, Reports,
 * Disputes, Analytics, Audit log) — same "glance, not a data dump" choice made for FR21/FR22:
 * recent lists capped to ADMIN_RECENT_LIMIT (10 for the audit log, since that's a longer-tail
 * log by nature), full counts/breakdowns come from getPlatformAnalytics() so there's exactly one
 * place computing them (no risk of the dashboard and a dedicated endpoint ever disagreeing).
 */
export async function getDashboard() {
  const [analytics, recentUsers, pendingKycCount, recentPendingKyc, recentReviews, categories, recentReports, recentDisputes, recentAuditLog] =
    await Promise.all([
      getPlatformAnalytics(),
      prisma.user.findMany({ select: userSummarySelect, orderBy: { createdAt: "desc" }, take: ADMIN_RECENT_LIMIT }),
      prisma.kycVerification.count({ where: { status: "PENDING" } }),
      prisma.kycVerification.findMany({
        where: { status: "PENDING" },
        include: { providerProfile: true },
        orderBy: { createdAt: "asc" },
        take: ADMIN_RECENT_LIMIT,
      }),
      prisma.review.findMany({
        include: {
          customer: { select: { firstName: true, lastName: true } },
          providerProfile: { select: { id: true, displayName: true } },
        },
        orderBy: { createdAt: "desc" },
        take: ADMIN_RECENT_LIMIT,
      }),
      prisma.category.findMany({ orderBy: { name: "asc" } }),
      prisma.report.findMany({ orderBy: { createdAt: "desc" }, take: ADMIN_RECENT_LIMIT }),
      prisma.dispute.findMany({
        include: { booking: { include: { customer: true, providerProfile: true } } },
        orderBy: { createdAt: "desc" },
        take: ADMIN_RECENT_LIMIT,
      }),
      prisma.auditLog.findMany({
        include: { actor: { select: { id: true, email: true, role: true } } },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

  return {
    users: { recent: recentUsers, total: analytics.users.total, byRole: analytics.users.byRole, byStatus: analytics.users.byStatus },
    verification: { pendingCount: pendingKycCount, recentPending: recentPendingKyc },
    reviews: { recent: recentReviews, total: analytics.reviews.total, averageRating: analytics.reviews.averageRating },
    categories,
    reports: { recent: recentReports, total: analytics.reports.total, byStatus: analytics.reports.byStatus },
    disputes: { recent: recentDisputes, total: analytics.disputes.total, byStatus: analytics.disputes.byStatus },
    analytics,
    auditLog: { recent: recentAuditLog },
  };
}
