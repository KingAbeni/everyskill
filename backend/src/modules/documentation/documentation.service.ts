import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import { z } from "zod";
import { submitBeforeDocumentationSchema, submitProviderDocumentationSchema } from "./documentation.schemas";
import { autoFlagImageIfSuspicious } from "../report/report.service";
import { compareBeforeAfterWithGroq } from "../../config/groq";

type SubmitBeforeInput = z.infer<typeof submitBeforeDocumentationSchema>;
type SubmitProviderInput = z.infer<typeof submitProviderDocumentationSchema>;

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

export async function submitBeforeDocumentation(userId: string, bookingId: string, input: SubmitBeforeInput) {
  const profile = await getCustomerProfileOrThrow(userId);
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.customerId !== profile.id) {
    throw new AppError(404, "Booking not found");
  }
  if (booking.status !== "ACCEPTED" && booking.status !== "IN_PROGRESS") {
    throw new AppError(409, `Cannot submit a before image for a booking in status ${booking.status}`);
  }

  const doc = await prisma.serviceDocumentation.create({
    data: { bookingId, kind: "BEFORE", imageUrl: input.imageUrl, uploadedById: userId },
  });
  await autoFlagImageIfSuspicious("DOCUMENTATION", doc.id, doc.imageUrl);
  return doc;
}

export async function listDocumentationAsCustomer(userId: string, bookingId: string) {
  const profile = await getCustomerProfileOrThrow(userId);
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.customerId !== profile.id) {
    throw new AppError(404, "Booking not found");
  }
  return prisma.serviceDocumentation.findMany({ where: { bookingId }, orderBy: { createdAt: "asc" } });
}

export async function submitProviderDocumentation(userId: string, bookingId: string, input: SubmitProviderInput) {
  const profile = await getProviderProfileOrThrow(userId);
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.providerProfileId !== profile.id) {
    throw new AppError(404, "Booking not found");
  }
  if (booking.status !== "IN_PROGRESS") {
    throw new AppError(409, `Cannot submit a ${input.kind.toLowerCase()} image for a booking in status ${booking.status}`);
  }

  const doc = await prisma.serviceDocumentation.create({
    data: { bookingId, kind: input.kind, imageUrl: input.imageUrl, uploadedById: userId },
  });
  await autoFlagImageIfSuspicious("DOCUMENTATION", doc.id, doc.imageUrl);
  return doc;
}

export async function listDocumentationAsProvider(userId: string, bookingId: string) {
  const profile = await getProviderProfileOrThrow(userId);
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.providerProfileId !== profile.id) {
    throw new AppError(404, "Booking not found");
  }
  return prisma.serviceDocumentation.findMany({ where: { bookingId }, orderBy: { createdAt: "asc" } });
}

/**
 * FR17 — per direct request, a completion image is required (implicit in the SRS's unqualified
 * "Provider completion images") and an after image, originally optional in the SRS, was made
 * mandatory too. Called from booking.service.ts's completeBooking before allowing IN_PROGRESS ->
 * COMPLETED, but only for listings with requiresDocumentation: true — some service types (e.g.
 * delivery) have nothing visual to document, per direct request. "Before" images are not gated
 * here regardless — the SRS never called them optional, but nothing in the booking lifecycle
 * naturally blocks on them either, so they stay a customer-side courtesy.
 */
export async function assertCompletionDocumentationExists(bookingId: string) {
  const [completionCount, afterCount] = await Promise.all([
    prisma.serviceDocumentation.count({ where: { bookingId, kind: "COMPLETION" } }),
    prisma.serviceDocumentation.count({ where: { bookingId, kind: "AFTER" } }),
  ]);
  if (completionCount === 0 || afterCount === 0) {
    throw new AppError(
      409,
      "Cannot complete this booking — at least one completion image and one after image are required first",
    );
  }
}

async function compareBeforeAfterForBooking(bookingId: string) {
  const [before, after] = await Promise.all([
    prisma.serviceDocumentation.findFirst({ where: { bookingId, kind: "BEFORE" }, orderBy: { createdAt: "asc" } }),
    prisma.serviceDocumentation.findFirst({ where: { bookingId, kind: "AFTER" }, orderBy: { createdAt: "asc" } }),
  ]);
  if (!before || !after) {
    throw new AppError(409, "Both a BEFORE and an AFTER image are required to run a comparison");
  }
  return compareBeforeAfterWithGroq(before.imageUrl, after.imageUrl);
}

export async function compareBeforeAfterAsCustomer(userId: string, bookingId: string) {
  const profile = await getCustomerProfileOrThrow(userId);
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.customerId !== profile.id) {
    throw new AppError(404, "Booking not found");
  }
  return compareBeforeAfterForBooking(bookingId);
}

export async function compareBeforeAfterAsProvider(userId: string, bookingId: string) {
  const profile = await getProviderProfileOrThrow(userId);
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.providerProfileId !== profile.id) {
    throw new AppError(404, "Booking not found");
  }
  return compareBeforeAfterForBooking(bookingId);
}
