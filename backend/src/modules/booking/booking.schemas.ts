import { z } from "zod";

export const createBookingSchema = z.object({
  listingId: z.string().uuid(),
  scheduledAt: z.coerce.date(),
  couponCode: z.string().min(1).optional(),
});

export const cancelBookingSchema = z.object({
  cancellationReason: z.string().min(1).optional(),
});
