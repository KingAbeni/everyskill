import { Request, Response } from "express";
import * as listingService from "./listing.service";
import * as reviewService from "../review/review.service";
import { aiSearchSchema, listPublicListingsQuerySchema } from "./listing.schemas";

export async function listPublicListingsHandler(req: Request, res: Response) {
  const query = listPublicListingsQuerySchema.parse(req.query);
  const listings = await listingService.listPublicListings(query);
  res.status(200).json(listings);
}

export async function getPublicListingHandler(req: Request, res: Response) {
  const listing = await listingService.getPublicListing(req.params.listingId);
  res.status(200).json(listing);
}

export async function getListingAvailabilityHandler(req: Request, res: Response) {
  const slots = await listingService.getListingAvailability(req.params.listingId);
  res.status(200).json(slots);
}

export async function aiSearchHandler(req: Request, res: Response) {
  const input = aiSearchSchema.parse(req.body);
  const result = await listingService.aiSearch(input);
  res.status(200).json(result);
}

export async function getListingReviewsHandler(req: Request, res: Response) {
  const reviews = await reviewService.listReviewsForListing(req.params.listingId);
  res.status(200).json(reviews);
}
