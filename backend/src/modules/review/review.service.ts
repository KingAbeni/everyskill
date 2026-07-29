import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import { z } from "zod";
import { createReviewSchema, replyToReviewSchema } from "./review.schemas";
import { notify, NotificationType } from "../notification/notification.service";
import { autoFlagImageIfSuspicious } from "../report/report.service";

type CreateReviewInput = z.infer<typeof createReviewSchema>;
type ReplyToReviewInput = z.infer<typeof replyToReviewSchema>;

const reviewerSelect = { firstName: true, lastName: true } as const;

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

export async function createReview(userId: string, bookingId: string, input: CreateReviewInput) {
  const profile = await getCustomerProfileOrThrow(userId);
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { providerProfile: true } });
  if (!booking || booking.customerId !== profile.id) {
    throw new AppError(404, "Booking not found");
  }
  if (booking.status !== "COMPLETED") {
    throw new AppError(409, `Cannot review a booking in status ${booking.status} — it must be COMPLETED`);
  }
  const existing = await prisma.review.findUnique({ where: { bookingId } });
  if (existing) {
    throw new AppError(409, "This booking has already been reviewed");
  }

  const review = await prisma.review.create({
    data: {
      bookingId,
      customerId: profile.id,
      providerProfileId: booking.providerProfileId,
      rating: input.rating,
      comment: input.comment,
      images: input.images ?? [],
    },
  });
  await notify(
    booking.providerProfile.userId,
    NotificationType.REVIEW_RECEIVED,
    `You received a ${input.rating}★ review`,
    bookingId,
  );

  await Promise.all((input.images ?? []).map((imageUrl) => autoFlagImageIfSuspicious("REVIEW", review.id, imageUrl)));

  return review;
}

export async function listMyReviewsAsCustomer(userId: string) {
  const profile = await getCustomerProfileOrThrow(userId);
  return prisma.review.findMany({
    where: { customerId: profile.id },
    include: { booking: { include: { listing: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function listReviewsForMyProvider(userId: string) {
  const profile = await getProviderProfileOrThrow(userId);
  return prisma.review.findMany({
    where: { providerProfileId: profile.id },
    include: { customer: { select: reviewerSelect }, booking: { include: { listing: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function replyToReview(userId: string, reviewId: string, input: ReplyToReviewInput) {
  const profile = await getProviderProfileOrThrow(userId);
  const review = await prisma.review.findUnique({ where: { id: reviewId }, include: { customer: true } });
  if (!review || review.providerProfileId !== profile.id) {
    throw new AppError(404, "Review not found");
  }
  if (review.providerReply) {
    throw new AppError(409, "This review already has a reply");
  }

  const updated = await prisma.review.update({
    where: { id: reviewId },
    data: { providerReply: input.reply, providerRepliedAt: new Date() },
  });
  await notify(review.customer.userId, NotificationType.REVIEW_REPLIED, "The provider replied to your review", review.bookingId);
  return updated;
}

export async function listReviewsForListing(listingId: string) {
  const listing = await prisma.serviceListing.findUnique({ where: { id: listingId } });
  if (!listing || !listing.isActive) {
    throw new AppError(404, "Listing not found");
  }
  return prisma.review.findMany({
    where: { booking: { listingId } },
    include: { customer: { select: reviewerSelect } },
    orderBy: { createdAt: "desc" },
  });
}

export type ProviderRatingSummary = { averageRating: number | null; reviewCount: number };

/**
 * Batch-computes {averageRating, reviewCount} per provider, for attaching to listing search
 * results (FR9) without an N+1 query per listing. Providers with no reviews are simply absent
 * from the returned map — callers should treat a missing entry as {averageRating: null, reviewCount: 0}.
 */
export async function getProviderRatingSummaries(
  providerProfileIds: string[],
): Promise<Map<string, ProviderRatingSummary>> {
  if (providerProfileIds.length === 0) {
    return new Map();
  }
  const grouped = await prisma.review.groupBy({
    by: ["providerProfileId"],
    where: { providerProfileId: { in: providerProfileIds } },
    _avg: { rating: true },
    _count: { rating: true },
  });
  const map = new Map<string, ProviderRatingSummary>();
  for (const row of grouped) {
    map.set(row.providerProfileId, {
      averageRating: row._avg.rating !== null ? Math.round(row._avg.rating * 10) / 10 : null,
      reviewCount: row._count.rating,
    });
  }
  return map;
}
