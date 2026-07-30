import { z } from "zod";

const discountDetailsSchema = z
  .object({
    percentOff: z.number().min(1).max(100).optional(),
    amountOff: z.number().positive().optional(),
  })
  .refine((d) => (d.percentOff !== undefined) !== (d.amountOff !== undefined), {
    message: "Provide exactly one of percentOff or amountOff",
    path: ["percentOff"],
  });

const campaignDetailsSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1).optional(),
  bannerImageUrl: z.string().url().optional(),
});

export const createPromotionSchema = z
  .discriminatedUnion("type", [
    z.object({
      type: z.literal("DISCOUNT"),
      details: discountDetailsSchema,
      maxRedemptions: z.number().int().positive().optional(),
      validFrom: z.coerce.date(),
      validTo: z.coerce.date(),
    }),
    z.object({
      type: z.literal("COUPON"),
      code: z.string().min(3),
      details: discountDetailsSchema,
      maxRedemptions: z.number().int().positive().optional(),
      validFrom: z.coerce.date(),
      validTo: z.coerce.date(),
    }),
    z.object({
      type: z.literal("CAMPAIGN"),
      details: campaignDetailsSchema,
      validFrom: z.coerce.date(),
      validTo: z.coerce.date(),
    }),
  ])
  .refine((d) => d.validFrom < d.validTo, {
    message: "validFrom must be before validTo",
    path: ["validTo"],
  });

// type/code are immutable after creation (matches ServiceDocumentation.kind/Report.targetType elsewhere).
export const updatePromotionSchema = z
  .object({
    details: z.record(z.string(), z.unknown()).optional(),
    validFrom: z.coerce.date().optional(),
    validTo: z.coerce.date().optional(),
    isActive: z.boolean().optional(),
    maxRedemptions: z.number().int().positive().nullable().optional(),
  })
  .refine((d) => !d.validFrom || !d.validTo || d.validFrom < d.validTo, {
    message: "validFrom must be before validTo",
    path: ["validTo"],
  });
