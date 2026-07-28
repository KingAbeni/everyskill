import { BookingStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import { z } from "zod";
import { proposeRescheduleSchema, respondRescheduleSchema } from "./reschedule.schemas";
import * as availabilityService from "../availability/availability.service";

type ProposeRescheduleInput = z.infer<typeof proposeRescheduleSchema>;
type RespondRescheduleInput = z.infer<typeof respondRescheduleSchema>;

const ACTIVE_STATUSES: BookingStatus[] = ["REQUESTED", "ACCEPTED", "IN_PROGRESS", "DISPUTED"];

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
  excludeBookingId: string,
): Promise<boolean> {
  const endAt = new Date(scheduledAt.getTime() + durationMinutes * 60_000);
  const candidates = await prisma.booking.findMany({
    where: {
      providerProfileId,
      status: { in: ACTIVE_STATUSES },
      id: { not: excludeBookingId },
    },
    include: { listing: { select: { durationMinutes: true } } },
  });

  return candidates.some((b) => {
    const bEnd = new Date(b.scheduledAt.getTime() + b.listing.durationMinutes * 60_000);
    return scheduledAt < bEnd && b.scheduledAt < endAt;
  });
}

function assertReschedulableStatus(status: BookingStatus) {
  if (status !== "ACCEPTED" && status !== "IN_PROGRESS") {
    throw new AppError(409, `Cannot propose a reschedule for a booking in status ${status}`);
  }
}

async function assertNoPendingRequest(bookingId: string) {
  const existing = await prisma.rescheduleRequest.findFirst({ where: { bookingId, status: "PENDING" } });
  if (existing) {
    throw new AppError(409, "This booking already has a pending reschedule request");
  }
}

async function assertProposedTimeIsValid(
  providerProfileId: string,
  proposedAt: Date,
  durationMinutes: number,
  bookingId: string,
) {
  if (proposedAt.getTime() <= Date.now()) {
    throw new AppError(400, "proposedAt must be in the future");
  }
  const isAvailable = await availabilityService.isProviderAvailableAt(providerProfileId, proposedAt, durationMinutes);
  if (!isAvailable) {
    throw new AppError(400, "Requested time is outside the provider's declared availability");
  }
  const hasConflict = await hasConflictingBooking(providerProfileId, proposedAt, durationMinutes, bookingId);
  if (hasConflict) {
    throw new AppError(409, "This time conflicts with an existing booking for this provider");
  }
}

export async function proposeRescheduleAsCustomer(userId: string, bookingId: string, input: ProposeRescheduleInput) {
  const profile = await getCustomerProfileOrThrow(userId);
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { listing: true } });
  if (!booking || booking.customerId !== profile.id) {
    throw new AppError(404, "Booking not found");
  }
  assertReschedulableStatus(booking.status);
  await assertNoPendingRequest(bookingId);
  await assertProposedTimeIsValid(booking.providerProfileId, input.proposedAt, booking.listing.durationMinutes, bookingId);

  return prisma.rescheduleRequest.create({
    data: { bookingId, proposedAt: input.proposedAt, requestedById: userId },
  });
}

export async function proposeRescheduleAsProvider(userId: string, bookingId: string, input: ProposeRescheduleInput) {
  const profile = await getProviderProfileOrThrow(userId);
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { listing: true } });
  if (!booking || booking.providerProfileId !== profile.id) {
    throw new AppError(404, "Booking not found");
  }
  assertReschedulableStatus(booking.status);
  await assertNoPendingRequest(bookingId);
  await assertProposedTimeIsValid(booking.providerProfileId, input.proposedAt, booking.listing.durationMinutes, bookingId);

  return prisma.rescheduleRequest.create({
    data: { bookingId, proposedAt: input.proposedAt, requestedById: userId },
  });
}

async function getRequestOrThrow(bookingId: string, requestId: string) {
  const request = await prisma.rescheduleRequest.findUnique({ where: { id: requestId } });
  if (!request || request.bookingId !== bookingId) {
    throw new AppError(404, "Reschedule request not found");
  }
  return request;
}

async function finalizeReschedule(
  booking: { id: string; providerProfileId: string; listing: { durationMinutes: number } },
  request: { id: string; proposedAt: Date },
  approve: boolean,
) {
  if (!approve) {
    return prisma.rescheduleRequest.update({
      where: { id: request.id },
      data: { status: "REJECTED", respondedAt: new Date() },
    });
  }

  const isAvailable = await availabilityService.isProviderAvailableAt(
    booking.providerProfileId,
    request.proposedAt,
    booking.listing.durationMinutes,
  );
  if (!isAvailable) {
    throw new AppError(409, "The provider is no longer available at the proposed time");
  }
  const hasConflict = await hasConflictingBooking(
    booking.providerProfileId,
    request.proposedAt,
    booking.listing.durationMinutes,
    booking.id,
  );
  if (hasConflict) {
    throw new AppError(409, "The proposed time now conflicts with another booking");
  }

  const [, updatedRequest] = await prisma.$transaction([
    prisma.booking.update({ where: { id: booking.id }, data: { scheduledAt: request.proposedAt } }),
    prisma.rescheduleRequest.update({
      where: { id: request.id },
      data: { status: "ACCEPTED", respondedAt: new Date() },
    }),
  ]);
  return updatedRequest;
}

export async function respondToRescheduleAsCustomer(
  userId: string,
  bookingId: string,
  requestId: string,
  input: RespondRescheduleInput,
) {
  const profile = await getCustomerProfileOrThrow(userId);
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { listing: true } });
  if (!booking || booking.customerId !== profile.id) {
    throw new AppError(404, "Booking not found");
  }
  const request = await getRequestOrThrow(bookingId, requestId);
  if (request.status !== "PENDING") {
    throw new AppError(409, `This reschedule request has already been ${request.status.toLowerCase()}`);
  }
  if (request.requestedById === userId) {
    throw new AppError(409, "You cannot respond to your own reschedule request");
  }

  return finalizeReschedule(booking, request, input.approve);
}

export async function respondToRescheduleAsProvider(
  userId: string,
  bookingId: string,
  requestId: string,
  input: RespondRescheduleInput,
) {
  const profile = await getProviderProfileOrThrow(userId);
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { listing: true } });
  if (!booking || booking.providerProfileId !== profile.id) {
    throw new AppError(404, "Booking not found");
  }
  const request = await getRequestOrThrow(bookingId, requestId);
  if (request.status !== "PENDING") {
    throw new AppError(409, `This reschedule request has already been ${request.status.toLowerCase()}`);
  }
  if (request.requestedById === userId) {
    throw new AppError(409, "You cannot respond to your own reschedule request");
  }

  return finalizeReschedule(booking, request, input.approve);
}
