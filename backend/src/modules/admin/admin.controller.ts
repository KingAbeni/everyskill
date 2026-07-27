import { Request, Response } from "express";
import * as adminService from "./admin.service";
import { createAdminSchema, forceResetAdminPasswordSchema, listKycQuerySchema, reviewKycSchema } from "./admin.schemas";

export async function listKycRequestsHandler(req: Request, res: Response) {
  const query = listKycQuerySchema.parse(req.query);
  const requests = await adminService.listKycRequests(query);
  res.status(200).json(requests);
}

export async function reviewKycRequestHandler(req: Request, res: Response) {
  const input = reviewKycSchema.parse(req.body);
  const updated = await adminService.reviewKycRequest(req.user!.sub, req.params.kycId, input);
  res.status(200).json(updated);
}

export async function getKycDocumentUrlHandler(req: Request, res: Response) {
  const result = await adminService.getKycDocumentUrl(req.params.kycId);
  res.status(200).json(result);
}

export async function listAdminsHandler(req: Request, res: Response) {
  const admins = await adminService.listAdmins();
  res.status(200).json(admins);
}

export async function createAdminHandler(req: Request, res: Response) {
  const input = createAdminSchema.parse(req.body);
  const admin = await adminService.createAdmin(req.user!.sub, input);
  res.status(201).json(admin);
}

export async function forceResetAdminPasswordHandler(req: Request, res: Response) {
  const input = forceResetAdminPasswordSchema.parse(req.body);
  await adminService.forceResetAdminPassword(req.user!.sub, req.params.userId, input);
  res.status(204).send();
}
