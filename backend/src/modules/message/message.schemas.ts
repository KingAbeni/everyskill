import { z } from "zod";

export const sendMessageSchema = z
  .object({
    content: z.string().min(1).optional(),
    imageUrl: z.string().url().optional(),
  })
  .refine((data) => !!data.content || !!data.imageUrl, {
    message: "Provide at least one of content or imageUrl",
    path: ["content"],
  });
