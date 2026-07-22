import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth, requireRole } from "../../middleware/auth";
import * as customerController from "./customer.controller";

export const customerRouter = Router();

customerRouter.use(requireAuth, requireRole("CUSTOMER"));

customerRouter.get("/me", asyncHandler(customerController.getProfileHandler));
customerRouter.patch("/me", asyncHandler(customerController.updateProfileHandler));
customerRouter.delete("/me", asyncHandler(customerController.deleteAccountHandler));
customerRouter.get("/me/export", asyncHandler(customerController.exportDataHandler));

customerRouter.get("/me/addresses", asyncHandler(customerController.listAddressesHandler));
customerRouter.post("/me/addresses", asyncHandler(customerController.createAddressHandler));
customerRouter.patch("/me/addresses/:addressId", asyncHandler(customerController.updateAddressHandler));
customerRouter.delete("/me/addresses/:addressId", asyncHandler(customerController.deleteAddressHandler));

customerRouter.get("/me/favorites", asyncHandler(customerController.listFavoritesHandler));
customerRouter.post("/me/favorites", asyncHandler(customerController.addFavoriteHandler));
customerRouter.delete("/me/favorites/:providerProfileId", asyncHandler(customerController.removeFavoriteHandler));

customerRouter.get("/me/bookings", asyncHandler(customerController.listBookingsHandler));
customerRouter.get("/me/payments", asyncHandler(customerController.listPaymentsHandler));

customerRouter.get("/me/consents", asyncHandler(customerController.listConsentsHandler));
customerRouter.post("/me/consents", asyncHandler(customerController.recordConsentHandler));
