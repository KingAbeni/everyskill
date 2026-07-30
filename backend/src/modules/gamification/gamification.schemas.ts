import { z } from "zod";

export const createTierSchema = z.object({
  name: z.string().min(1),
  minXp: z.number().int().min(0),
  order: z.number().int().min(1),
});

export const updateTierSchema = z.object({
  name: z.string().min(1).optional(),
  minXp: z.number().int().min(0).optional(),
  order: z.number().int().min(1).optional(),
  isActive: z.boolean().optional(),
});

export const createAchievementSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
});

export const updateAchievementSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

export const updateGamificationSettingsSchema = z.object({
  xpPerCompletedJob: z.number().int().min(0).optional(),
  xpPerFiveStarReview: z.number().int().min(0).optional(),
  xpStreakBonusEvery: z.number().int().min(0).optional(),
  xpStreakBonusAmount: z.number().int().min(0).optional(),
  xpPerYearMilestone: z.number().int().min(0).optional(),
});

export const listQrAuditQuerySchema = z.object({
  bookingId: z.string().uuid().optional(),
  providerProfileId: z.string().uuid().optional(),
});
