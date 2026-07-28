import { z } from "zod";

export const createBookingSchema = z.object({
  listingId: z.string().uuid(),
  scheduledAt: z.coerce.date(),
});

export const cancelBookingSchema = z.object({
  cancellationReason: z.string().min(1).optional(),
});
