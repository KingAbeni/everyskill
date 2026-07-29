import { z } from "zod";

export const createReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().min(1).optional(),
  images: z.array(z.string().url()).optional(),
});

export const replyToReviewSchema = z.object({
  reply: z.string().min(1),
});
