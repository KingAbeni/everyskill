import { Request, Response } from "express";
import * as providerService from "./provider.service";
import { createCertificationSchema, updateProviderProfileSchema } from "./provider.schemas";

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
