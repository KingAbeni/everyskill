import { z } from "zod";

export const validateQrSchema = z.object({
  token: z.string().min(1),
});
