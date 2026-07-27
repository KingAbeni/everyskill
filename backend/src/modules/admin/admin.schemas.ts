import { z } from "zod";

export const listKycQuerySchema = z.object({
  status: z.enum(["PENDING", "VERIFIED", "REJECTED"]).optional(),
});

export const reviewKycSchema = z
  .object({
    status: z.enum(["VERIFIED", "REJECTED"]),
    rejectionReason: z.string().min(1).optional(),
  })
  .refine((data) => data.status !== "REJECTED" || !!data.rejectionReason, {
    message: "rejectionReason is required when status is REJECTED",
    path: ["rejectionReason"],
  });

export const createAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["ADMIN", "SUPER_ADMIN"]).default("ADMIN"),
});

export const forceResetAdminPasswordSchema = z.object({
  newPassword: z.string().min(8),
});
