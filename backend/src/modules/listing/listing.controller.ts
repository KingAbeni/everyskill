import { Request, Response } from "express";
import * as listingService from "./listing.service";
import { listPublicListingsQuerySchema } from "./listing.schemas";

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
