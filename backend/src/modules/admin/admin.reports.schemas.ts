import { z } from "zod";

const dateRangeShape = {
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
};

/** Time-series reports (Users, Providers, Bookings, Revenue, Customer Satisfaction, Growth). */
export const timeSeriesQuerySchema = z
  .object({
    ...dateRangeShape,
    groupBy: z.enum(["day", "week", "month"]).optional().default("day"),
  })
  .refine((data) => !data.startDate || !data.endDate || data.startDate <= data.endDate, {
    message: "startDate must be before or equal to endDate",
    path: ["endDate"],
  });

/** Ranking reports (Service Popularity, Provider Performance) — no time bucketing, just a top-N list. */
export const rankingQuerySchema = z
  .object({
    ...dateRangeShape,
    limit: z.coerce.number().int().positive().max(50).optional().default(10),
  })
  .refine((data) => !data.startDate || !data.endDate || data.startDate <= data.endDate, {
    message: "startDate must be before or equal to endDate",
    path: ["endDate"],
  });

/** Plain snapshot reports scoped to a date range with no bucketing or ranking (Financial). */
export const plainRangeQuerySchema = z
  .object(dateRangeShape)
  .refine((data) => !data.startDate || !data.endDate || data.startDate <= data.endDate, {
    message: "startDate must be before or equal to endDate",
    path: ["endDate"],
  });
