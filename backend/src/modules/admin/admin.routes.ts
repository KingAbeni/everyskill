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

// Platform settings (FR24 "Commissions") — GET open to ADMIN/SUPER_ADMIN, PATCH SUPER_ADMIN only.
adminRouter.get("/platform-settings", asyncHandler(adminController.getPlatformSettingsHandler));
adminRouter.patch(
  "/platform-settings",
  requireRole("SUPER_ADMIN"),
  asyncHandler(adminController.updatePlatformSettingsHandler),
);

// Manual reactivation for a SUSPENDED account (FR13 violations have no auto-reinstatement).
adminRouter.patch("/users/:userId/reactivate", asyncHandler(adminController.reactivateUserHandler));

// Dispute resolution (FR13).
adminRouter.get("/disputes", asyncHandler(adminController.listDisputesHandler));
adminRouter.get("/disputes/:disputeId", asyncHandler(adminController.getDisputeHandler));
adminRouter.patch("/disputes/:disputeId/review", asyncHandler(adminController.markDisputeUnderReviewHandler));
adminRouter.patch("/disputes/:disputeId/resolve", asyncHandler(adminController.resolveDisputeHandler));
