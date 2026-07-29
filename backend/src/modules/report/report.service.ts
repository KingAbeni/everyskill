import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import { z } from "zod";
import { actionReportSchema, createReportSchema, listReportsQuerySchema } from "./report.schemas";
import { notify, NotificationType } from "../notification/notification.service";
import { detectSuspiciousImageWithGroq } from "../../config/groq";

type CreateReportInput = z.infer<typeof createReportSchema>;
type ListReportsQuery = z.infer<typeof listReportsQuerySchema>;
type ActionReportInput = z.infer<typeof actionReportSchema>;

/**
 * Reports are polymorphic (targetType + targetId) since they can point at a User, Review,
 * Message, or ServiceListing. This resolves both "does the target actually exist" (for filing)
 * and "which User does moderation action (warn/suspend/ban) ultimately apply to" (for actioning) —
 * e.g. a reported Review resolves to its author, a reported Message to its sender.
 */
async function resolveTargetOwnerUserId(
  targetType: CreateReportInput["targetType"],
  targetId: string,
): Promise<string | null> {
  if (targetType === "USER") {
    const user = await prisma.user.findUnique({ where: { id: targetId } });
    return user?.id ?? null;
  }
  if (targetType === "REVIEW") {
    const review = await prisma.review.findUnique({ where: { id: targetId }, include: { customer: true } });
    return review?.customer.userId ?? null;
  }
  if (targetType === "MESSAGE") {
    const message = await prisma.message.findUnique({ where: { id: targetId } });
    return message?.senderId ?? null;
  }
  if (targetType === "DOCUMENTATION") {
    const doc = await prisma.serviceDocumentation.findUnique({ where: { id: targetId } });
    return doc?.uploadedById ?? null;
  }
  const listing = await prisma.serviceListing.findUnique({ where: { id: targetId }, include: { providerProfile: true } });
  return listing?.providerProfile.userId ?? null;
}

async function notifyAllAdmins(type: (typeof NotificationType)[keyof typeof NotificationType], content: string) {
  const admins = await prisma.user.findMany({ where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } }, select: { id: true } });
  await Promise.all(admins.map((admin) => notify(admin.id, type, content)));
}

export async function createReport(userId: string, input: CreateReportInput) {
  const ownerUserId = await resolveTargetOwnerUserId(input.targetType, input.targetId);
  if (!ownerUserId) {
    throw new AppError(404, `${input.targetType} not found`);
  }

  const report = await prisma.report.create({
    data: {
      reporterId: userId,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      description: input.description,
      images: input.images ?? [],
    },
  });

  await notifyAllAdmins(
    NotificationType.REPORT_FILED,
    `A new report was filed: ${input.reason} against ${input.targetType.toLowerCase()} ${input.targetId}`,
  );

  return report;
}

export async function listMyReports(userId: string) {
  return prisma.report.findMany({ where: { reporterId: userId }, orderBy: { createdAt: "desc" } });
}

export async function listReports(query: ListReportsQuery) {
  return prisma.report.findMany({
    where: query.status ? { status: query.status } : undefined,
    orderBy: { createdAt: "asc" },
  });
}

export async function getReport(reportId: string) {
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) {
    throw new AppError(404, "Report not found");
  }
  return report;
}

export async function markReportReviewed(adminUserId: string, reportId: string) {
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) {
    throw new AppError(404, "Report not found");
  }
  if (report.status !== "PENDING") {
    throw new AppError(409, `Cannot mark a report reviewed from status ${report.status}`);
  }
  return prisma.report.update({
    where: { id: reportId },
    data: { status: "REVIEWED", reviewedById: adminUserId, reviewedAt: new Date() },
  });
}

export async function actionReport(adminUserId: string, reportId: string, input: ActionReportInput) {
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) {
    throw new AppError(404, "Report not found");
  }
  if (report.status === "ACTIONED" || report.status === "DISMISSED") {
    throw new AppError(409, `This report has already been ${report.status.toLowerCase()}`);
  }

  if (input.action !== "DISMISS") {
    const ownerUserId = await resolveTargetOwnerUserId(report.targetType, report.targetId);
    if (!ownerUserId) {
      throw new AppError(409, "Cannot action this report — its target no longer exists");
    }

    if (input.action === "WARN") {
      await prisma.user.update({ where: { id: ownerUserId }, data: { warningCount: { increment: 1 } } });
      await notify(
        ownerUserId,
        NotificationType.WARNING_ISSUED,
        input.resolutionNote ?? "You have received a warning for violating platform policies",
      );
    } else if (input.action === "SUSPEND") {
      await prisma.user.update({ where: { id: ownerUserId }, data: { status: "SUSPENDED" } });
      await notify(
        ownerUserId,
        NotificationType.ACCOUNT_SUSPENDED,
        input.resolutionNote ?? "Your account has been suspended following a moderation report",
      );
    } else {
      await prisma.user.update({ where: { id: ownerUserId }, data: { status: "BANNED" } });
      await notify(
        ownerUserId,
        NotificationType.ACCOUNT_BANNED,
        input.resolutionNote ?? "Your account has been banned following a moderation report",
      );
    }

    await prisma.auditLog.create({
      data: {
        actorId: adminUserId,
        action: `REPORT_${input.action}`,
        targetType: "User",
        targetId: ownerUserId,
        metadata: { reportId, resolutionNote: input.resolutionNote ?? null } as Prisma.InputJsonValue,
      },
    });
  }

  return prisma.report.update({
    where: { id: reportId },
    data: {
      status: input.action === "DISMISS" ? "DISMISSED" : "ACTIONED",
      actionTaken: input.action,
      resolutionNote: input.resolutionNote,
      reviewedById: adminUserId,
      reviewedAt: new Date(),
    },
  });
}

/**
 * FR20 — automatic suspicious-image detection, called (fire-and-await, but never throwing) from
 * listing/review/documentation creation whenever a new image is submitted. Deliberately swallows
 * all errors: this is a best-effort moderation signal, not a hard gate, and a Groq outage must
 * never block a listing/review/documentation submission. reporterId is left null (system-filed —
 * see the schema comment on Report.reporterId).
 */
export async function autoFlagImageIfSuspicious(
  targetType: "LISTING" | "REVIEW" | "DOCUMENTATION",
  targetId: string,
  imageUrl: string,
): Promise<void> {
  try {
    const verdict = await detectSuspiciousImageWithGroq(imageUrl);
    if (!verdict.suspicious) {
      return;
    }
    await prisma.report.create({
      data: {
        targetType,
        targetId,
        reason: "INAPPROPRIATE_CONTENT",
        description: `Auto-flagged by AI image analysis (${verdict.confidence} confidence): ${verdict.reasoning}`,
        images: [imageUrl],
      },
    });
    await notifyAllAdmins(
      NotificationType.REPORT_FILED,
      `An automatically-flagged image was detected on a ${targetType.toLowerCase()}: ${verdict.reasoning}`,
    );
  } catch {
    // Best-effort — never let AI moderation failures break the underlying create operation.
  }
}
