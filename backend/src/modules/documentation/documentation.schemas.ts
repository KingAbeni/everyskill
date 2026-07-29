import { z } from "zod";

export const submitBeforeDocumentationSchema = z.object({
  imageUrl: z.string().url(),
});

export const submitProviderDocumentationSchema = z.object({
  kind: z.enum(["COMPLETION", "AFTER"]),
  imageUrl: z.string().url(),
});
