import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth, requireRole } from "../../middleware/auth";
import * as providerController from "./provider.controller";

export const providerRouter = Router();

providerRouter.use(requireAuth, requireRole("PROVIDER"));

providerRouter.get("/me", asyncHandler(providerController.getProfileHandler));
providerRouter.patch("/me", asyncHandler(providerController.updateProfileHandler));

providerRouter.get("/me/certifications", asyncHandler(providerController.listCertificationsHandler));
providerRouter.post("/me/certifications", asyncHandler(providerController.createCertificationHandler));
providerRouter.delete("/me/certifications/:certificationId", asyncHandler(providerController.deleteCertificationHandler));

providerRouter.get("/me/kyc", asyncHandler(providerController.listKycDocumentsHandler));
providerRouter.post("/me/kyc", asyncHandler(providerController.submitKycDocumentHandler));
providerRouter.get("/me/kyc/:kycId/document-url", asyncHandler(providerController.getKycDocumentUrlHandler));
