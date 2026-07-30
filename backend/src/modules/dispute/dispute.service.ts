import { BookingStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import { z } from "zod";
import { listDisputesQuerySchema, openDisputeSchema, resolveDisputeSchema } from "./dispute.schemas";
import * as bookingService from "../booking/booking.service";
import { releasePayment, refundPaymentForDispute } from "../payment/payment.service";
import { notify, NotificationType } from "../notification/notification.service";
import { resetStreak } from "../gamification/xp.service";

type OpenDisputeInput = z.infer<typeof openDisputeSchema>;
type ResolveDisputeInput = z.infer<typeof resolveDisputeSchema>;
type ListDisputesQuery = z.infer<typeof listDisputesQuerySchema>;

const DISPUTABLE_STATUSES: BookingStatus[] = ["ACCEPTED", "IN_PROGRESS", "WAITING_FOR_CONFIRMATION", "COMPLETED"];

const disputeInclude = {
  booking: { include: { customer: true, providerProfile: true, listing: true, payment: true } },
} as const;

async function getCustomerProfileOrThrow(userId: string) {
  const profile = await prisma.customerProfile.findUnique({ where: { userId } });
  if (!profile) {
    throw new AppError(404, "Customer profile not found");
  }
  return profile;
}

async function getProviderProfileOrThrow(userId: string) {
  const profile = await prisma.providerProfile.findUnique({ where: { userId } });
  if (!profile) {
    throw new AppError(404, "Provider profile not found");
  }
  return profile;
}

async function openDispute(
  booking: { id: string; status: BookingStatus; customerId: string; providerProfileId: string },
  userId: string,
  input: OpenDisputeInput,
) {
  if (!DISPUTABLE_STATUSES.includes(booking.status)) {
    throw new AppError(409, `Cannot open a dispute for a booking in status ${booking.status}`);
  }
  const existing = await prisma.dispute.findUnique({ where: { bookingId: booking.id } });
  if (existing) {
    throw new AppError(409, "A dispute already exists for this booking");
  }

  const dispute = await prisma.dispute.create({
    data: { bookingId: booking.id, raisedById: userId, reason: input.reason },
  });
  await bookingService.transitionToDisputed(booking.id, userId);

  const [customerProfile, providerProfile] = await Promise.all([
    prisma.customerProfile.findUniqueOrThrow({ where: { id: booking.customerId }, select: { userId: true } }),
    prisma.providerProfile.findUniqueOrThrow({ where: { id: booking.providerProfileId }, select: { userId: true } }),
  ]);
  const recipientUserId = userId === customerProfile.userId ? providerProfile.userId : customerProfile.userId;
  await notify(recipientUserId, NotificationType.DISPUTE_OPENED, "A dispute has been opened for your booking", booking.id);

  return dispute;
}

export async function openDisputeAsCustomer(userId: string, bookingId: string, input: OpenDisputeInput) {
  const profile = await getCustomerProfileOrThrow(userId);
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.customerId !== profile.id) {
    throw new AppError(404, "Booking not found");
  }
  return openDispute(booking, userId, input);
}

export async function openDisputeAsProvider(userId: string, bookingId: string, input: OpenDisputeInput) {
  const profile = await getProviderProfileOrThrow(userId);
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.providerProfileId !== profile.id) {
    throw new AppError(404, "Booking not found");
  }
  return openDispute(booking, userId, input);
}

export async function listDisputes(query: ListDisputesQuery) {
  return prisma.dispute.findMany({
    where: query.status ? { status: query.status } : undefined,
    include: disputeInclude,
    orderBy: { createdAt: "asc" },
  });
}

export async function getDispute(disputeId: string) {
  const dispute = await prisma.dispute.findUnique({ where: { id: disputeId }, include: disputeInclude });
  if (!dispute) {
    throw new AppError(404, "Dispute not found");
  }
  return dispute;
}

export async function markUnderReview(disputeId: string) {
  const dispute = await prisma.dispute.findUnique({ where: { id: disputeId } });
  if (!dispute) {
    throw new AppError(404, "Dispute not found");
  }
  if (dispute.status !== "OPEN") {
    throw new AppError(409, `Cannot mark a dispute under review from status ${dispute.status}`);
  }
  return prisma.dispute.update({ where: { id: disputeId }, data: { status: "UNDER_REVIEW" } });
}

export async function resolveDispute(adminUserId: string, disputeId: string, input: ResolveDisputeInput) {
  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: { booking: { include: { customer: true, providerProfile: true } } },
  });
  if (!dispute) {
    throw new AppError(404, "Dispute not found");
  }
  if (dispute.status === "RESOLVED" || dispute.status === "REJECTED") {
    throw new AppError(409, `This dispute has already been ${dispute.status.toLowerCase()}`);
  }

  if (input.decision === "DISMISS") {
    await bookingService.resolveDisputeTransition(dispute.bookingId, adminUserId, "COMPLETED");
  } else if (input.decision === "RELEASE_PROVIDER") {
    await bookingService.resolveDisputeTransition(dispute.bookingId, adminUserId, "COMPLETED");
    await releasePayment(dispute.bookingId);
  } else {
    await bookingService.resolveDisputeTransition(dispute.bookingId, adminUserId, "CANCELLED");
    await refundPaymentForDispute(dispute.bookingId);
    // Resolved against the provider — breaks their gamification streak, same as any other provider-fault outcome.
    await resetStreak(dispute.booking.providerProfileId);
  }

  const updated = await prisma.dispute.update({
    where: { id: disputeId },
    data: {
      status: input.decision === "DISMISS" ? "REJECTED" : "RESOLVED",
      resolution: input.resolution,
      resolvedById: adminUserId,
      resolvedAt: new Date(),
    },
  });

  const outcomeText =
    input.decision === "DISMISS"
      ? "dismissed — the booking was marked completed"
      : input.decision === "RELEASE_PROVIDER"
        ? "resolved in the provider's favor — payment released"
        : "resolved in the customer's favor — payment refunded";
  await notify(dispute.booking.customer.userId, NotificationType.DISPUTE_RESOLVED, `Your dispute was ${outcomeText}`, dispute.bookingId);
  await notify(
    dispute.booking.providerProfile.userId,
    NotificationType.DISPUTE_RESOLVED,
    `The dispute for your booking was ${outcomeText}`,
    dispute.bookingId,
  );

  return updated;
}
