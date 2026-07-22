import { Request, Response } from "express";
import * as customerService from "./customer.service";
import {
  addFavoriteSchema,
  createAddressSchema,
  recordConsentSchema,
  updateAddressSchema,
  updateProfileSchema,
} from "./customer.schemas";

export async function getProfileHandler(req: Request, res: Response) {
  const profile = await customerService.getMyProfile(req.user!.sub);
  res.status(200).json(profile);
}

export async function updateProfileHandler(req: Request, res: Response) {
  const input = updateProfileSchema.parse(req.body);
  const profile = await customerService.updateMyProfile(req.user!.sub, input);
  res.status(200).json(profile);
}

export async function listAddressesHandler(req: Request, res: Response) {
  const addresses = await customerService.listAddresses(req.user!.sub);
  res.status(200).json(addresses);
}

export async function createAddressHandler(req: Request, res: Response) {
  const input = createAddressSchema.parse(req.body);
  const address = await customerService.createAddress(req.user!.sub, input);
  res.status(201).json(address);
}

export async function updateAddressHandler(req: Request, res: Response) {
  const input = updateAddressSchema.parse(req.body);
  const address = await customerService.updateAddress(req.user!.sub, req.params.addressId, input);
  res.status(200).json(address);
}

export async function deleteAddressHandler(req: Request, res: Response) {
  await customerService.deleteAddress(req.user!.sub, req.params.addressId);
  res.status(204).send();
}

export async function listFavoritesHandler(req: Request, res: Response) {
  const favorites = await customerService.listFavorites(req.user!.sub);
  res.status(200).json(favorites);
}

export async function addFavoriteHandler(req: Request, res: Response) {
  const input = addFavoriteSchema.parse(req.body);
  const favorite = await customerService.addFavorite(req.user!.sub, input);
  res.status(201).json(favorite);
}

export async function removeFavoriteHandler(req: Request, res: Response) {
  await customerService.removeFavorite(req.user!.sub, req.params.providerProfileId);
  res.status(204).send();
}

export async function listBookingsHandler(req: Request, res: Response) {
  const bookings = await customerService.listBookings(req.user!.sub);
  res.status(200).json(bookings);
}

export async function listPaymentsHandler(req: Request, res: Response) {
  const payments = await customerService.listPayments(req.user!.sub);
  res.status(200).json(payments);
}

export async function listConsentsHandler(req: Request, res: Response) {
  const consents = await customerService.listConsents(req.user!.sub);
  res.status(200).json(consents);
}

export async function recordConsentHandler(req: Request, res: Response) {
  const input = recordConsentSchema.parse(req.body);
  const consent = await customerService.recordConsent(req.user!.sub, input);
  res.status(201).json(consent);
}

export async function exportDataHandler(req: Request, res: Response) {
  const data = await customerService.exportMyData(req.user!.sub);
  res.status(200).json(data);
}

export async function deleteAccountHandler(req: Request, res: Response) {
  await customerService.requestAccountDeletion(req.user!.sub);
  res.status(204).send();
}
