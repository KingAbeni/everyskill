import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import * as listingController from "./listing.controller";

export const listingRouter = Router();

listingRouter.get("/", asyncHandler(listingController.listPublicListingsHandler));
listingRouter.get("/:listingId", asyncHandler(listingController.getPublicListingHandler));
listingRouter.get("/:listingId/availability", asyncHandler(listingController.getListingAvailabilityHandler));
