import { Request, Response } from "express";
import * as providerService from "./provider.service";
import * as listingService from "../listing/listing.service";
import * as availabilityService from "../availability/availability.service";
import { createCertificationSchema, submitKycDocumentSchema, updateProviderProfileSchema } from "./provider.schemas";
import { createListingSchema, recommendCategorySchema, updateListingSchema } from "../listing/listing.schemas";
import { createSlotSchema, updateSlotSchema } from "../availability/availability.schemas";

export async function getProfileHandler(req: Request, res: Response) {
  const profile = await providerService.getMyProfile(req.user!.sub);
  res.status(200).json(profile);
}

export async function updateProfileHandler(req: Request, res: Response) {
  const input = updateProviderProfileSchema.parse(req.body);
  const profile = await providerService.updateMyProfile(req.user!.sub, input);
  res.status(200).json(profile);
}

export async function listCertificationsHandler(req: Request, res: Response) {
  const certs = await providerService.listCertifications(req.user!.sub);
  res.status(200).json(certs);
}

export async function createCertificationHandler(req: Request, res: Response) {
  const input = createCertificationSchema.parse(req.body);
  const cert = await providerService.createCertification(req.user!.sub, input);
  res.status(201).json(cert);
}

export async function deleteCertificationHandler(req: Request, res: Response) {
  await providerService.deleteCertification(req.user!.sub, req.params.certificationId);
  res.status(204).send();
}

export async function listKycDocumentsHandler(req: Request, res: Response) {
  const docs = await providerService.listKycDocuments(req.user!.sub);
  res.status(200).json(docs);
}

export async function submitKycDocumentHandler(req: Request, res: Response) {
  const input = submitKycDocumentSchema.parse(req.body);
  const doc = await providerService.submitKycDocument(req.user!.sub, input);
  res.status(201).json(doc);
}

export async function getKycDocumentUrlHandler(req: Request, res: Response) {
  const result = await providerService.getKycDocumentUrl(req.user!.sub, req.params.kycId);
  res.status(200).json(result);
}

export async function listMyListingsHandler(req: Request, res: Response) {
  const listings = await listingService.listMyListings(req.user!.sub);
  res.status(200).json(listings);
}

export async function getMyListingHandler(req: Request, res: Response) {
  const listing = await listingService.getMyListing(req.user!.sub, req.params.listingId);
  res.status(200).json(listing);
}

export async function createMyListingHandler(req: Request, res: Response) {
  const input = createListingSchema.parse(req.body);
  const listing = await listingService.createListing(req.user!.sub, input);
  res.status(201).json(listing);
}

export async function updateMyListingHandler(req: Request, res: Response) {
  const input = updateListingSchema.parse(req.body);
  const listing = await listingService.updateListing(req.user!.sub, req.params.listingId, input);
  res.status(200).json(listing);
}

export async function deleteMyListingHandler(req: Request, res: Response) {
  await listingService.deleteListing(req.user!.sub, req.params.listingId);
  res.status(204).send();
}

export async function recommendCategoryHandler(req: Request, res: Response) {
  const input = recommendCategorySchema.parse(req.body);
  const recommendation = await listingService.recommendCategory(input);
  res.status(200).json(recommendation);
}

export async function listMyAvailabilityHandler(req: Request, res: Response) {
  const slots = await availabilityService.listMySlots(req.user!.sub);
  res.status(200).json(slots);
}

export async function createMyAvailabilitySlotHandler(req: Request, res: Response) {
  const input = createSlotSchema.parse(req.body);
  const slot = await availabilityService.createSlot(req.user!.sub, input);
  res.status(201).json(slot);
}

export async function updateMyAvailabilitySlotHandler(req: Request, res: Response) {
  const input = updateSlotSchema.parse(req.body);
  const slot = await availabilityService.updateSlot(req.user!.sub, req.params.slotId, input);
  res.status(200).json(slot);
}

export async function deleteMyAvailabilitySlotHandler(req: Request, res: Response) {
  await availabilityService.deleteSlot(req.user!.sub, req.params.slotId);
  res.status(204).send();
}
