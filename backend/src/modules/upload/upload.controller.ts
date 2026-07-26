import { Request, Response } from "express";
import { AppError } from "../../utils/AppError";
import * as uploadService from "./upload.service";

export async function uploadFileHandler(req: Request, res: Response) {
  if (!req.file) {
    throw new AppError(400, "No file provided (expected multipart/form-data field 'file')");
  }
  const url = await uploadService.uploadFile(req.user!.sub, req.file);
  res.status(201).json({ url });
}

export async function uploadKycFileHandler(req: Request, res: Response) {
  if (!req.file) {
    throw new AppError(400, "No file provided (expected multipart/form-data field 'file')");
  }
  const path = await uploadService.uploadKycFile(req.user!.sub, req.file);
  res.status(201).json({ path });
}
