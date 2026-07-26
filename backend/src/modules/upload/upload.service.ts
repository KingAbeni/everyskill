import { randomUUID } from "crypto";
import path from "path";
import { uploadFileToStorage, uploadKycFileToStorage } from "../../config/supabaseStorage";

export async function uploadFile(userId: string, file: Express.Multer.File) {
  const ext = path.extname(file.originalname);
  const objectPath = `${userId}/${randomUUID()}${ext}`;
  return uploadFileToStorage(objectPath, file.buffer, file.mimetype);
}

export async function uploadKycFile(userId: string, file: Express.Multer.File) {
  const ext = path.extname(file.originalname);
  const objectPath = `${userId}/${randomUUID()}${ext}`;
  return uploadKycFileToStorage(objectPath, file.buffer, file.mimetype);
}
