import { z } from "zod";

export const createReportSchema = z.object({
  targetType: z.enum(["USER", "REVIEW", "MESSAGE", "LISTING", "DOCUMENTATION"]),
  targetId: z.string().uuid(),
  reason: z.enum([
    "POOR_QUALITY",
    "FRAUD",
    "INAPPROPRIATE_BEHAVIOUR",
    "FAKE_REVIEW",
    "OFFENSIVE_MESSAGE",
    "SCAM_PROVIDER",
    "INAPPROPRIATE_CONTENT",
  ]),
  description: z.string().min(1).optional(),
  images: z.array(z.string().url()).optional(),
});

export const listReportsQuerySchema = z.object({
  status: z.enum(["PENDING", "REVIEWED", "ACTIONED", "DISMISSED"]).optional(),
});

export const actionReportSchema = z.object({
  action: z.enum(["WARN", "SUSPEND", "BAN", "DISMISS"]),
  resolutionNote: z.string().min(1).optional(),
});
