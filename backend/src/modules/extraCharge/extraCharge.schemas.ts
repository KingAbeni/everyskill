import { z } from "zod";

export const createExtraChargeSchema = z.object({
  amount: z.coerce.number().positive(),
  reason: z.string().min(1),
});

export const respondExtraChargeSchema = z.object({
  approve: z.boolean(),
});

export const payExtraChargeSchema = z.object({
  method: z.enum(["stripe", "offline"]).default("stripe"),
  paymentMethodId: z.string().min(1).optional(),
});
