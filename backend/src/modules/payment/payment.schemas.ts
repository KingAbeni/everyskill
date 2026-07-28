import { z } from "zod";

export const payBookingSchema = z.object({
  method: z.enum(["stripe", "offline"]).default("stripe"),
  paymentMethodId: z.string().min(1).optional(),
});

export const withdrawSchema = z.object({
  amount: z.coerce.number().positive().optional(),
});

export const payBillSchema = z.object({
  method: z.enum(["stripe", "balance"]),
  paymentMethodId: z.string().min(1).optional(),
});
