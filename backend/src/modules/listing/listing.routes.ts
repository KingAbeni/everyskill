import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import * as listingController from "./listing.controller";

export const listingRouter = Router();

listingRouter.get("/", asyncHandler(listingController.listPublicListingsHandler));
listingRouter.post("/ai-search", asyncHandler(listingController.aiSearchHandler));
listingRouter.get("/:listingId", asyncHandler(listingController.getPublicListingHandler));
listingRouter.get("/:listingId/availability", asyncHandler(listingController.getListingAvailabilityHandler));
listingRouter.get("/:listingId/reviews", asyncHandler(listingController.getListingReviewsHandler));
