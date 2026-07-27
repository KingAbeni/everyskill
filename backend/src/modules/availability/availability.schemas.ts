import { z } from "zod";

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
const timeField = z.string().regex(timeRegex, "Must be in 24-hour HH:MM format");

export const createSlotSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6).optional(),
    date: z.coerce.date().optional(),
    startTime: timeField,
    endTime: timeField,
    isBlocked: z.boolean().optional().default(false),
  })
  .refine((d) => (d.dayOfWeek !== undefined) !== (d.date !== undefined), {
    message: "Provide exactly one of dayOfWeek (recurring weekly slot) or date (specific-date slot)",
    path: ["dayOfWeek"],
  })
  .refine((d) => d.startTime < d.endTime, {
    message: "endTime must be after startTime",
    path: ["endTime"],
  });

export const updateSlotSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  date: z.coerce.date().nullable().optional(),
  startTime: timeField.optional(),
  endTime: timeField.optional(),
  isBlocked: z.boolean().optional(),
});
