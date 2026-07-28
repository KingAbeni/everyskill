import { z } from "zod";

export const proposeRescheduleSchema = z.object({
  proposedAt: z.coerce.date(),
});

export const respondRescheduleSchema = z.object({
  approve: z.boolean(),
});
