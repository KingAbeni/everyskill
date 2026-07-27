import { z } from "zod";

export const listPublicListingsQuerySchema = z.object({
  categoryId: z.string().uuid().optional(),
  providerProfileId: z.string().uuid().optional(),
  search: z.string().min(1).optional(),
  pricingType: z.enum(["HOURLY", "FIXED"]).optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
});

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
});

export const recommendCategorySchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
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
  isActive: z.boolean().optional(),
});
