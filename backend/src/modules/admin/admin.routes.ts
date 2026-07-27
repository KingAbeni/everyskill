import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth, requireRole } from "../../middleware/auth";
import * as adminController from "./admin.controller";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole("ADMIN", "SUPER_ADMIN"));

adminRouter.get("/kyc", asyncHandler(adminController.listKycRequestsHandler));
adminRouter.patch("/kyc/:kycId", asyncHandler(adminController.reviewKycRequestHandler));
adminRouter.get("/kyc/:kycId/document-url", asyncHandler(adminController.getKycDocumentUrlHandler));

// Administrator management (FR24) — SUPER_ADMIN only, narrower than the ADMIN/SUPER_ADMIN default above.
adminRouter.get("/admins", requireRole("SUPER_ADMIN"), asyncHandler(adminController.listAdminsHandler));
adminRouter.post("/admins", requireRole("SUPER_ADMIN"), asyncHandler(adminController.createAdminHandler));
adminRouter.patch(
  "/admins/:userId/password",
  requireRole("SUPER_ADMIN"),
  asyncHandler(adminController.forceResetAdminPasswordHandler),
);
