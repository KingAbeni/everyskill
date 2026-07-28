import crypto from "node:crypto";
import { BookingStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import { z } from "zod";
import { cancelBookingSchema, createBookingSchema } from "./booking.schemas";
import * as availabilityService from "../availability/availability.service";
import * as paymentService from "../payment/payment.service";

type CreateBookingInput = z.infer<typeof createBookingSchema>;
type CancelBookingInput = z.infer<typeof cancelBookingSchema>;

const bookingInclude = {
  listing: true,
  providerProfile: true,
  customer: true,
  payment: true,
  extraCharges: true,
} as const;

// Statuses that still "occupy" a provider's time slot — used for double-booking conflict checks.
const ACTIVE_STATUSES: BookingStatus[] = ["REQUESTED", "ACCEPTED", "IN_PROGRESS", "DISPUTED"];

// Valid status transitions (FR11). DISPUTED is entered only via the Dispute flow (FR13), not
// through a direct transition here.
const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  REQUESTED: ["ACCEPTED", "DECLINED", "CANCELLED"],
  ACCEPTED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
  DECLINED: [],
  DISPUTED: [],
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

  const bookingId = crypto.randomUUID();
  const [booking] = await prisma.$transaction([
    prisma.booking.create({
      data: {
        id: bookingId,
        customerId: customerProfile.id,
        providerProfileId: listing.providerProfileId,
        listingId: listing.id,
        scheduledAt: input.scheduledAt,
        price: listing.price,
      },
      include: bookingInclude,
    }),
    prisma.bookingStatusHistory.create({
      data: { bookingId, fromStatus: null, toStatus: "REQUESTED", changedById: userId },
    }),
  ]);

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
  extra?: { cancellationReason?: string },
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
          ? { cancelledAt: new Date(), cancellationReason: extra?.cancellationReason ?? null }
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

export async function acceptBooking(userId: string, bookingId: string) {
  const profile = await getProviderProfileOrThrow(userId);
  const booking = await getOwnedProviderBookingOrThrow(profile.id, bookingId);
  return transition(bookingId, booking.status, userId, "ACCEPTED");
}

export async function declineBooking(userId: string, bookingId: string) {
  const profile = await getProviderProfileOrThrow(userId);
  const booking = await getOwnedProviderBookingOrThrow(profile.id, bookingId);
  return transition(bookingId, booking.status, userId, "DECLINED");
}

export async function startBooking(userId: string, bookingId: string) {
  const profile = await getProviderProfileOrThrow(userId);
  const booking = await getOwnedProviderBookingOrThrow(profile.id, bookingId);
  return transition(bookingId, booking.status, userId, "IN_PROGRESS");
}

export async function completeBooking(userId: string, bookingId: string) {
  const profile = await getProviderProfileOrThrow(userId);
  const booking = await getOwnedProviderBookingOrThrow(profile.id, bookingId);
  return transition(bookingId, booking.status, userId, "COMPLETED");
}

export async function cancelBookingAsProvider(userId: string, bookingId: string, input: CancelBookingInput) {
  const profile = await getProviderProfileOrThrow(userId);
  const booking = await getOwnedProviderBookingOrThrow(profile.id, bookingId);
  return transition(bookingId, booking.status, userId, "CANCELLED", { cancellationReason: input.cancellationReason });
}

export async function cancelBookingAsCustomer(userId: string, bookingId: string, input: CancelBookingInput) {
  const profile = await getCustomerProfileOrThrow(userId);
  const booking = await getOwnedCustomerBookingOrThrow(profile.id, bookingId);
  return transition(bookingId, booking.status, userId, "CANCELLED", { cancellationReason: input.cancellationReason });
}
