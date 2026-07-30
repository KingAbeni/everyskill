import crypto from "node:crypto";
import { BookingStatus, NoShowParty } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import { z } from "zod";
import { cancelBookingSchema, createBookingSchema } from "./booking.schemas";
import * as availabilityService from "../availability/availability.service";
import * as paymentService from "../payment/payment.service";
import { notify, NotificationType } from "../notification/notification.service";
import { assertCompletionDocumentationExists } from "../documentation/documentation.service";
import { buildRedemptionIncrementQuery, resolveBookingPromotion } from "../promotion/promotion.service";

type CreateBookingInput = z.infer<typeof createBookingSchema>;
type CancelBookingInput = z.infer<typeof cancelBookingSchema>;

const bookingInclude = {
  listing: true,
  providerProfile: true,
  customer: true,
  payment: true,
  extraCharges: true,
  rescheduleRequests: true,
} as const;

// Statuses that still "occupy" a provider's time slot — used for double-booking conflict checks.
const ACTIVE_STATUSES: BookingStatus[] = ["REQUESTED", "ACCEPTED", "IN_PROGRESS", "DISPUTED"];

// A party's total logged violations (late cancellations + no-shows) at or above this triggers
// an automatic suspension (FR13) — an admin must manually reactivate (see admin.service.ts).
const VIOLATION_SUSPENSION_THRESHOLD = 3;

// Valid status transitions (FR11/FR13). DISPUTED is entered only via the Dispute flow, and only
// leaves it via dispute resolution (see dispute.service.ts) — never a direct action here.
const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  REQUESTED: ["ACCEPTED", "DECLINED", "CANCELLED"],
  ACCEPTED: ["IN_PROGRESS", "CANCELLED", "DISPUTED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED", "DISPUTED"],
  COMPLETED: ["DISPUTED"],
  CANCELLED: [],
  DECLINED: [],
  DISPUTED: ["COMPLETED", "CANCELLED"],
};

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

async function hasConflictingBooking(
  providerProfileId: string,
  scheduledAt: Date,
  durationMinutes: number,
  excludeBookingId?: string,
): Promise<boolean> {
  const endAt = new Date(scheduledAt.getTime() + durationMinutes * 60_000);
  const candidates = await prisma.booking.findMany({
    where: {
      providerProfileId,
      status: { in: ACTIVE_STATUSES },
      id: excludeBookingId ? { not: excludeBookingId } : undefined,
    },
    include: { listing: { select: { durationMinutes: true } } },
  });

  return candidates.some((b) => {
    const bEnd = new Date(b.scheduledAt.getTime() + b.listing.durationMinutes * 60_000);
    return scheduledAt < bEnd && b.scheduledAt < endAt;
  });
}

export async function createBooking(userId: string, input: CreateBookingInput) {
  const customerProfile = await getCustomerProfileOrThrow(userId);

  const listing = await prisma.serviceListing.findUnique({ where: { id: input.listingId } });
  if (!listing || !listing.isActive) {
    throw new AppError(404, "Listing not found");
  }

  if (input.scheduledAt.getTime() <= Date.now()) {
    throw new AppError(400, "scheduledAt must be in the future");
  }

  const isAvailable = await availabilityService.isProviderAvailableAt(
    listing.providerProfileId,
    input.scheduledAt,
    listing.durationMinutes,
  );
  if (!isAvailable) {
    throw new AppError(400, "Requested time is outside the provider's declared availability");
  }

  const hasConflict = await hasConflictingBooking(listing.providerProfileId, input.scheduledAt, listing.durationMinutes);
  if (hasConflict) {
    throw new AppError(409, "This time conflicts with an existing booking for this provider");
  }

  const listingPrice = Number(listing.price);
  const appliedPromotion = await resolveBookingPromotion(listing.providerProfileId, listingPrice, input.couponCode);
  const finalPrice = appliedPromotion ? Math.max(0, listingPrice - appliedPromotion.discountAmount) : listingPrice;

  const bookingId = crypto.randomUUID();
  const [booking] = await prisma.$transaction([
    prisma.booking.create({
      data: {
        id: bookingId,
        customerId: customerProfile.id,
        providerProfileId: listing.providerProfileId,
        listingId: listing.id,
        scheduledAt: input.scheduledAt,
        price: finalPrice,
        originalPrice: appliedPromotion ? listingPrice : null,
        appliedPromotionId: appliedPromotion?.promotionId ?? null,
      },
      include: bookingInclude,
    }),
    prisma.bookingStatusHistory.create({
      data: { bookingId, fromStatus: null, toStatus: "REQUESTED", changedById: userId },
    }),
    prisma.conversation.create({ data: { bookingId } }),
    ...(appliedPromotion ? [buildRedemptionIncrementQuery(appliedPromotion.promotionId)] : []),
  ]);

  await notify(
    booking.providerProfile.userId,
    NotificationType.BOOKING_REQUESTED,
    `New booking request for "${booking.listing.title}"`,
    booking.id,
  );

  return booking;
}

async function getOwnedCustomerBookingOrThrow(customerProfileId: string, bookingId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: bookingInclude });
  if (!booking || booking.customerId !== customerProfileId) {
    throw new AppError(404, "Booking not found");
  }
  return booking;
}

async function getOwnedProviderBookingOrThrow(providerProfileId: string, bookingId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: bookingInclude });
  if (!booking || booking.providerProfileId !== providerProfileId) {
    throw new AppError(404, "Booking not found");
  }
  return booking;
}

export async function getCustomerBooking(userId: string, bookingId: string) {
  const profile = await getCustomerProfileOrThrow(userId);
  const booking = await getOwnedCustomerBookingOrThrow(profile.id, bookingId);
  const statusHistory = await prisma.bookingStatusHistory.findMany({
    where: { bookingId },
    orderBy: { createdAt: "asc" },
  });
  return { ...booking, statusHistory };
}

export async function listProviderBookings(userId: string) {
  const profile = await getProviderProfileOrThrow(userId);
  return prisma.booking.findMany({
    where: { providerProfileId: profile.id },
    include: bookingInclude,
    orderBy: { scheduledAt: "desc" },
  });
}

export async function getProviderBooking(userId: string, bookingId: string) {
  const profile = await getProviderProfileOrThrow(userId);
  const booking = await getOwnedProviderBookingOrThrow(profile.id, bookingId);
  const statusHistory = await prisma.bookingStatusHistory.findMany({
    where: { bookingId },
    orderBy: { createdAt: "asc" },
  });
  return { ...booking, statusHistory };
}

async function transition(
  bookingId: string,
  fromStatus: BookingStatus,
  actorUserId: string,
  toStatus: BookingStatus,
  extra?: { cancellationReason?: string; noShowBy?: NoShowParty },
) {
  const allowed = TRANSITIONS[fromStatus];
  if (!allowed.includes(toStatus)) {
    throw new AppError(409, `Cannot transition booking from ${fromStatus} to ${toStatus}`);
  }

  await prisma.$transaction([
    prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: toStatus,
        ...(toStatus === "CANCELLED"
          ? {
              cancelledAt: new Date(),
              cancellationReason: extra?.cancellationReason ?? null,
              noShowBy: extra?.noShowBy ?? null,
            }
          : {}),
      },
    }),
    prisma.bookingStatusHistory.create({
      data: { bookingId, fromStatus, toStatus, changedById: actorUserId },
    }),
  ]);

  // Booking status <-> payment status sync (FR11/FR12). No-op if the booking was never paid.
  if (toStatus === "COMPLETED") {
    await paymentService.releasePayment(bookingId);
  } else if (toStatus === "CANCELLED") {
    await paymentService.refundPayment(bookingId);
  }

  return prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, include: bookingInclude });
}

/**
 * FR13 — increments a party's violation counter (late cancellation or no-show) and, once their
 * total reaches VIOLATION_SUSPENSION_THRESHOLD, auto-suspends their account. There is no
 * automatic reinstatement path here (unlike the FR12 offline-billing suspension) — an
 * ADMIN/SUPER_ADMIN must manually reactivate via PATCH /api/admin/users/:userId/reactivate.
 */
async function recordViolation(role: "CUSTOMER" | "PROVIDER", profileId: string, type: "lateCancellation" | "noShow") {
  const field = type === "lateCancellation" ? "lateCancellationCount" : "noShowCount";

  if (role === "CUSTOMER") {
    const updated = await prisma.customerProfile.update({
      where: { id: profileId },
      data: { [field]: { increment: 1 } },
    });
    if (updated.lateCancellationCount + updated.noShowCount >= VIOLATION_SUSPENSION_THRESHOLD) {
      await prisma.user.update({ where: { id: updated.userId }, data: { status: "SUSPENDED" } });
      await notify(
        updated.userId,
        NotificationType.ACCOUNT_SUSPENDED,
        "Your account has been suspended due to repeated late cancellations/no-shows. Contact support to appeal.",
      );
    }
  } else {
    const updated = await prisma.providerProfile.update({
      where: { id: profileId },
      data: { [field]: { increment: 1 } },
    });
    if (updated.lateCancellationCount + updated.noShowCount >= VIOLATION_SUSPENSION_THRESHOLD) {
      await prisma.user.update({ where: { id: updated.userId }, data: { status: "SUSPENDED" } });
      await notify(
        updated.userId,
        NotificationType.ACCOUNT_SUSPENDED,
        "Your account has been suspended due to repeated late cancellations/no-shows. Contact support to appeal.",
      );
    }
  }
}

function isLateCancellation(booking: { scheduledAt: Date; listing: { cancellationCutoffHours: number } }): boolean {
  const hoursUntil = (booking.scheduledAt.getTime() - Date.now()) / (1000 * 60 * 60);
  return hoursUntil < booking.listing.cancellationCutoffHours;
}

export async function acceptBooking(userId: string, bookingId: string) {
  const profile = await getProviderProfileOrThrow(userId);
  const booking = await getOwnedProviderBookingOrThrow(profile.id, bookingId);
  const updated = await transition(bookingId, booking.status, userId, "ACCEPTED");
  await notify(
    updated.customer.userId,
    NotificationType.BOOKING_ACCEPTED,
    `Your booking for "${updated.listing.title}" was accepted`,
    bookingId,
  );
  return updated;
}

export async function declineBooking(userId: string, bookingId: string) {
  const profile = await getProviderProfileOrThrow(userId);
  const booking = await getOwnedProviderBookingOrThrow(profile.id, bookingId);
  const updated = await transition(bookingId, booking.status, userId, "DECLINED");
  await notify(
    updated.customer.userId,
    NotificationType.BOOKING_DECLINED,
    `Your booking for "${updated.listing.title}" was declined`,
    bookingId,
  );
  return updated;
}

export async function startBooking(userId: string, bookingId: string) {
  const profile = await getProviderProfileOrThrow(userId);
  const booking = await getOwnedProviderBookingOrThrow(profile.id, bookingId);
  const updated = await transition(bookingId, booking.status, userId, "IN_PROGRESS");
  await notify(
    updated.customer.userId,
    NotificationType.BOOKING_STARTED,
    `Your booking for "${updated.listing.title}" has started`,
    bookingId,
  );
  return updated;
}

export async function completeBooking(userId: string, bookingId: string) {
  const profile = await getProviderProfileOrThrow(userId);
  const booking = await getOwnedProviderBookingOrThrow(profile.id, bookingId);
  if (booking.listing.requiresDocumentation) {
    await assertCompletionDocumentationExists(bookingId);
  }
  const updated = await transition(bookingId, booking.status, userId, "COMPLETED");
  await notify(
    updated.customer.userId,
    NotificationType.BOOKING_COMPLETED,
    `Your booking for "${updated.listing.title}" is complete. Leave a review!`,
    bookingId,
  );
  return updated;
}

export async function cancelBookingAsProvider(userId: string, bookingId: string, input: CancelBookingInput) {
  const profile = await getProviderProfileOrThrow(userId);
  const booking = await getOwnedProviderBookingOrThrow(profile.id, bookingId);
  const wasCommitted = booking.status === "ACCEPTED" || booking.status === "IN_PROGRESS";
  const updated = await transition(bookingId, booking.status, userId, "CANCELLED", {
    cancellationReason: input.cancellationReason,
  });
  if (wasCommitted && isLateCancellation(booking)) {
    await recordViolation("PROVIDER", profile.id, "lateCancellation");
  }
  await notify(
    updated.customer.userId,
    NotificationType.BOOKING_CANCELLED,
    `The provider cancelled your booking for "${updated.listing.title}"`,
    bookingId,
  );
  return updated;
}

export async function cancelBookingAsCustomer(userId: string, bookingId: string, input: CancelBookingInput) {
  const profile = await getCustomerProfileOrThrow(userId);
  const booking = await getOwnedCustomerBookingOrThrow(profile.id, bookingId);
  const wasCommitted = booking.status === "ACCEPTED" || booking.status === "IN_PROGRESS";
  const updated = await transition(bookingId, booking.status, userId, "CANCELLED", {
    cancellationReason: input.cancellationReason,
  });
  if (wasCommitted && isLateCancellation(booking)) {
    await recordViolation("CUSTOMER", profile.id, "lateCancellation");
  }
  await notify(
    updated.providerProfile.userId,
    NotificationType.BOOKING_CANCELLED,
    `The customer cancelled the booking for "${updated.listing.title}"`,
    bookingId,
  );
  return updated;
}

export async function markCustomerNoShow(userId: string, bookingId: string) {
  const profile = await getProviderProfileOrThrow(userId);
  const booking = await getOwnedProviderBookingOrThrow(profile.id, bookingId);
  if (booking.status !== "ACCEPTED" && booking.status !== "IN_PROGRESS") {
    throw new AppError(409, `Cannot mark a no-show for a booking in status ${booking.status}`);
  }
  if (booking.scheduledAt.getTime() > Date.now()) {
    throw new AppError(400, "Cannot mark a no-show before the scheduled time has passed");
  }
  const updated = await transition(bookingId, booking.status, userId, "CANCELLED", {
    cancellationReason: "Customer no-show",
    noShowBy: "CUSTOMER",
  });
  await recordViolation("CUSTOMER", booking.customerId, "noShow");
  await notify(
    updated.customer.userId,
    NotificationType.BOOKING_NO_SHOW,
    `You were marked as a no-show for "${updated.listing.title}"`,
    bookingId,
  );
  return updated;
}

export async function markProviderNoShow(userId: string, bookingId: string) {
  const profile = await getCustomerProfileOrThrow(userId);
  const booking = await getOwnedCustomerBookingOrThrow(profile.id, bookingId);
  if (booking.status !== "ACCEPTED" && booking.status !== "IN_PROGRESS") {
    throw new AppError(409, `Cannot mark a no-show for a booking in status ${booking.status}`);
  }
  if (booking.scheduledAt.getTime() > Date.now()) {
    throw new AppError(400, "Cannot mark a no-show before the scheduled time has passed");
  }
  const updated = await transition(bookingId, booking.status, userId, "CANCELLED", {
    cancellationReason: "Provider no-show",
    noShowBy: "PROVIDER",
  });
  await recordViolation("PROVIDER", booking.providerProfileId, "noShow");
  await notify(
    updated.providerProfile.userId,
    NotificationType.BOOKING_NO_SHOW,
    `You were marked as a no-show for "${updated.listing.title}"`,
    bookingId,
  );
  return updated;
}

/** Used by dispute.service.ts to open a dispute (FR13) — ACCEPTED/IN_PROGRESS/COMPLETED -> DISPUTED. */
export async function transitionToDisputed(bookingId: string, actorUserId: string) {
  const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
  return transition(bookingId, booking.status, actorUserId, "DISPUTED");
}

/** Used by dispute.service.ts to resolve a dispute (FR13) — DISPUTED -> COMPLETED or CANCELLED. */
export async function resolveDisputeTransition(
  bookingId: string,
  actorUserId: string,
  toStatus: "COMPLETED" | "CANCELLED",
) {
  const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
  return transition(bookingId, booking.status, actorUserId, toStatus);
}
