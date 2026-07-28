import { z } from "zod";

export const openDisputeSchema = z.object({
  reason: z.string().min(1),
});

export const resolveDisputeSchema = z.object({
  decision: z.enum(["REFUND_CUSTOMER", "RELEASE_PROVIDER", "DISMISS"]),
  resolution: z.string().min(1),
});

export const listDisputesQuerySchema = z.object({
  status: z.enum(["OPEN", "UNDER_REVIEW", "RESOLVED", "REJECTED"]).optional(),
});
