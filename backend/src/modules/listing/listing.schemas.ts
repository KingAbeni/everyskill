import { z } from "zod";

export const listPublicListingsQuerySchema = z
  .object({
    categoryId: z.string().uuid().optional(),
    providerProfileId: z.string().uuid().optional(),
    search: z.string().min(1).optional(),
    pricingType: z.enum(["HOURLY", "FIXED"]).optional(),
    minPrice: z.coerce.number().nonnegative().optional(),
    maxPrice: z.coerce.number().nonnegative().optional(),
    providerType: z.enum(["INDIVIDUAL", "BUSINESS"]).optional(),
    verified: z.coerce.boolean().optional(),
    minRating: z.coerce.number().min(1).max(5).optional(),
    location: z.string().min(1).optional(),
    availableDate: z.coerce.date().optional(),
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    radiusKm: z.coerce.number().positive().optional(),
  })
  .refine(
    (q) => {
      const provided = [q.latitude !== undefined, q.longitude !== undefined, q.radiusKm !== undefined];
      return provided.every((p) => p) || provided.every((p) => !p);
    },
    {
      message: "latitude, longitude, and radiusKm must all be provided together for distance search",
      path: ["radiusKm"],
    },
  );

export const createListingSchema = z.object({
  categoryIds: z.array(z.string().uuid()).min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  pricingType: z.enum(["HOURLY", "FIXED"]).optional().default("FIXED"),
  price: z.coerce.number().positive(),
  durationMinutes: z.number().int().positive(),
  images: z.array(z.string().url()).optional(),
  serviceArea: z.string().min(1).optional(),
  tags: z.array(z.string().min(1)).optional(),
  cancellationCutoffHours: z.number().int().min(0).optional(),
  requiresDocumentation: z.boolean().optional(),
});

export const recommendCategorySchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
});

export const aiSearchSchema = z.object({
  query: z.string().min(1),
});

export const updateListingSchema = z.object({
  categoryIds: z.array(z.string().uuid()).min(1).optional(),
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  pricingType: z.enum(["HOURLY", "FIXED"]).optional(),
  price: z.coerce.number().positive().optional(),
  durationMinutes: z.number().int().positive().optional(),
  images: z.array(z.string().url()).optional(),
  serviceArea: z.string().min(1).optional(),
  tags: z.array(z.string().min(1)).optional(),
  cancellationCutoffHours: z.number().int().min(0).optional(),
  requiresDocumentation: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const recommendCategoryFromImageSchema = z.object({
  imageUrl: z.string().url(),
});

export const analyzeImageSchema = z.object({
  imageUrl: z.string().url(),
});
