import { z } from "zod";

export const updateProfileSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  avatarUrl: z.string().url().optional(),
  privacyPreferences: z.record(z.string(), z.unknown()).optional(),
});

export const createAddressSchema = z.object({
  label: z.string().min(1).optional(),
  line1: z.string().min(1),
  line2: z.string().min(1).optional(),
  city: z.string().min(1),
  state: z.string().min(1).optional(),
  country: z.string().min(1),
  postalCode: z.string().min(1).optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  isDefault: z.boolean().optional(),
});

export const updateAddressSchema = createAddressSchema.partial();

export const addFavoriteSchema = z.object({
  providerProfileId: z.string().min(1),
});

export const recordConsentSchema = z.object({
  consentType: z.string().min(1),
  granted: z.boolean(),
});
