import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import { z } from "zod";
import {
  createListingSchema,
  listPublicListingsQuerySchema,
  recommendCategorySchema,
  updateListingSchema,
} from "./listing.schemas";
import * as availabilityService from "../availability/availability.service";
import { recommendCategoryWithGroq } from "../../config/groq";

type ListPublicQuery = z.infer<typeof listPublicListingsQuerySchema>;
type CreateListingInput = z.infer<typeof createListingSchema>;
type UpdateListingInput = z.infer<typeof updateListingSchema>;
type RecommendCategoryInput = z.infer<typeof recommendCategorySchema>;

const providerSummarySelect = {
  id: true,
  displayName: true,
  providerType: true,
  verificationStatus: true,
  profileImage: true,
} as const;

export async function listPublicListings(query: ListPublicQuery) {
  return prisma.serviceListing.findMany({
    where: {
      isActive: true,
      categories: query.categoryId ? { some: { id: query.categoryId } } : undefined,
      providerProfileId: query.providerProfileId,
      pricingType: query.pricingType,
      price:
        query.minPrice !== undefined || query.maxPrice !== undefined
          ? { gte: query.minPrice, lte: query.maxPrice }
          : undefined,
      OR: query.search
        ? [
            { title: { contains: query.search, mode: "insensitive" } },
            { description: { contains: query.search, mode: "insensitive" } },
          ]
        : undefined,
    },
    include: { categories: true, providerProfile: { select: providerSummarySelect } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPublicListing(listingId: string) {
  const listing = await prisma.serviceListing.findUnique({
    where: { id: listingId },
    include: { categories: true, providerProfile: { select: providerSummarySelect } },
  });
  if (!listing || !listing.isActive) {
    throw new AppError(404, "Listing not found");
  }
  return listing;
}

export async function getListingAvailability(listingId: string) {
  const listing = await getPublicListing(listingId);
  return availabilityService.listProviderAvailability(listing.providerProfileId);
}

async function getProviderProfileOrThrow(userId: string) {
  const profile = await prisma.providerProfile.findUnique({ where: { userId } });
  if (!profile) {
    throw new AppError(404, "Provider profile not found");
  }
  return profile;
}

async function assertCategoriesExist(categoryIds: string[]) {
  const found = await prisma.category.findMany({ where: { id: { in: categoryIds } } });
  if (found.length !== new Set(categoryIds).size) {
    throw new AppError(404, "One or more categories not found");
  }
}

export async function listMyListings(userId: string) {
  const profile = await getProviderProfileOrThrow(userId);
  return prisma.serviceListing.findMany({
    where: { providerProfileId: profile.id },
    include: { categories: true },
    orderBy: { createdAt: "desc" },
  });
}

async function getOwnedListingOrThrow(userId: string, listingId: string) {
  const profile = await getProviderProfileOrThrow(userId);
  const listing = await prisma.serviceListing.findUnique({
    where: { id: listingId },
    include: { categories: true },
  });
  if (!listing || listing.providerProfileId !== profile.id) {
    throw new AppError(404, "Listing not found");
  }
  return { profile, listing };
}

export async function getMyListing(userId: string, listingId: string) {
  const { listing } = await getOwnedListingOrThrow(userId, listingId);
  return listing;
}

export async function createListing(userId: string, input: CreateListingInput) {
  const profile = await getProviderProfileOrThrow(userId);
  await assertCategoriesExist(input.categoryIds);
  const { categoryIds, ...rest } = input;
  return prisma.serviceListing.create({
    data: {
      ...rest,
      providerProfileId: profile.id,
      categories: { connect: categoryIds.map((id) => ({ id })) },
    },
    include: { categories: true },
  });
}

export async function updateListing(userId: string, listingId: string, input: UpdateListingInput) {
  await getOwnedListingOrThrow(userId, listingId);
  const { categoryIds, ...rest } = input;
  if (categoryIds) {
    await assertCategoriesExist(categoryIds);
  }
  return prisma.serviceListing.update({
    where: { id: listingId },
    data: {
      ...rest,
      categories: categoryIds ? { set: categoryIds.map((id) => ({ id })) } : undefined,
    },
    include: { categories: true },
  });
}

export async function deleteListing(userId: string, listingId: string) {
  await getOwnedListingOrThrow(userId, listingId);
  await prisma.serviceListing.delete({ where: { id: listingId } });
}

export async function recommendCategory(input: RecommendCategoryInput) {
  const categories = await prisma.category.findMany({ select: { id: true, name: true } });
  if (categories.length === 0) {
    throw new AppError(409, "No categories exist yet to recommend from");
  }

  const recommendation = await recommendCategoryWithGroq(categories, input.title, input.description);
  const category = categories.find((c) => c.id === recommendation.categoryId)!;

  return {
    category,
    confidence: recommendation.confidence,
    reasoning: recommendation.reasoning,
  };
}
