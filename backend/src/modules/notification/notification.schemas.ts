import { z } from "zod";

export const listNotificationsQuerySchema = z.object({
  unreadOnly: z.coerce.boolean().optional(),
});
