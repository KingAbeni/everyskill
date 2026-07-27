import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import { z } from "zod";
import {
  aiSearchSchema,
  createListingSchema,
  listPublicListingsQuerySchema,
  recommendCategorySchema,
  updateListingSchema,
} from "./listing.schemas";
import * as availabilityService from "../availability/availability.service";
import { interpretSearchQueryWithGroq, recommendCategoryWithGroq } from "../../config/groq";

type ListPublicQuery = z.infer<typeof listPublicListingsQuerySchema>;
type CreateListingInput = z.infer<typeof createListingSchema>;
type UpdateListingInput = z.infer<typeof updateListingSchema>;
type RecommendCategoryInput = z.infer<typeof recommendCategorySchema>;
type AiSearchInput = z.infer<typeof aiSearchSchema>;

const providerSummarySelect = {
  id: true,
  displayName: true,
  providerType: true,
  verificationStatus: true,
  profileImage: true,
  serviceArea: true,
  latitude: true,
  longitude: true,
} as const;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export async function listPublicListings(query: ListPublicQuery) {
  const conditions: Prisma.ServiceListingWhereInput[] = [{ isActive: true }];

  if (query.categoryId) {
    conditions.push({ categories: { some: { id: query.categoryId } } });
  }
  if (query.providerProfileId) {
    conditions.push({ providerProfileId: query.providerProfileId });
  }
  if (query.pricingType) {
    conditions.push({ pricingType: query.pricingType });
  }
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    conditions.push({ price: { gte: query.minPrice, lte: query.maxPrice } });
  }
  if (query.search) {
    conditions.push({
      OR: [
        { title: { contains: query.search, mode: "insensitive" } },
        { description: { contains: query.search, mode: "insensitive" } },
      ],
    });
  }

  const providerConditions: Prisma.ProviderProfileWhereInput = {};
  if (query.verified) {
    providerConditions.verificationStatus = "VERIFIED";
  }
  if (query.providerType) {
    providerConditions.providerType = query.providerType;
  }
  if (query.location) {
    providerConditions.serviceArea = { contains: query.location, mode: "insensitive" };
  }
  if (query.latitude !== undefined) {
    providerConditions.latitude = { not: null };
    providerConditions.longitude = { not: null };
  }
  if (Object.keys(providerConditions).length > 0) {
    conditions.push({ providerProfile: providerConditions });
  }

  if (query.availableDate) {
    const availableProviderIds = await availabilityService.listAvailableProviderIds(query.availableDate);
    conditions.push({ providerProfileId: { in: availableProviderIds } });
  }

  const listings = await prisma.serviceListing.findMany({
    where: { AND: conditions },
    include: { categories: true, providerProfile: { select: providerSummarySelect } },
    orderBy: { createdAt: "desc" },
  });

  if (query.latitude !== undefined && query.longitude !== undefined && query.radiusKm !== undefined) {
    const { latitude, longitude, radiusKm } = query;
    return listings
      .map((listing) => ({
        ...listing,
        distanceKm: haversineKm(latitude, longitude, listing.providerProfile.latitude!, listing.providerProfile.longitude!),
      }))
      .filter((listing) => listing.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }

  return listings;
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

export async function aiSearch(input: AiSearchInput) {
  const categories = await prisma.category.findMany({ select: { id: true, name: true } });
  const todayIso = new Date().toISOString().slice(0, 10);

  const interpretation = await interpretSearchQueryWithGroq(categories, input.query, todayIso);
  const category = interpretation.categoryId ? categories.find((c) => c.id === interpretation.categoryId) : undefined;

  const searchQuery: ListPublicQuery = {
    categoryId: interpretation.categoryId ?? undefined,
    minPrice: interpretation.minPrice ?? undefined,
    maxPrice: interpretation.maxPrice ?? undefined,
    location: interpretation.location ?? undefined,
    availableDate: interpretation.availableDate ? new Date(interpretation.availableDate) : undefined,
  };

  const results = await listPublicListings(searchQuery);

  const resultsWithReasons = results.map((listing) => {
    const reasons: string[] = [];
    if (category && listing.categories.some((c) => c.id === category.id)) {
      reasons.push(`Matches requested service: ${category.name}`);
    }
    if (interpretation.minPrice !== null || interpretation.maxPrice !== null) {
      reasons.push("Within requested budget");
    }
    if (interpretation.location) {
      reasons.push(`Serves ${interpretation.location}`);
    }
    if (interpretation.availableDate) {
      reasons.push(`Available on ${interpretation.availableDate}`);
    }
    if (listing.providerProfile.verificationStatus === "VERIFIED") {
      reasons.push("Verified provider");
    }
    return { ...listing, matchReasons: reasons };
  });

  return {
    interpretation: {
      category: category ? { id: category.id, name: category.name } : null,
      minPrice: interpretation.minPrice,
      maxPrice: interpretation.maxPrice,
      location: interpretation.location,
      availableDate: interpretation.availableDate,
      urgency: interpretation.urgency,
      explanation: interpretation.explanation,
    },
    results: resultsWithReasons,
  };
}
