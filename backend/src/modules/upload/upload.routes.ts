import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth, requireRole } from "../../middleware/auth";
import { AppError } from "../../utils/AppError";
import * as uploadController from "./upload.controller";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new AppError(400, "Unsupported file type. Allowed: JPEG, PNG, WebP, PDF."));
      return;
    }
    cb(null, true);
  },
});

export const uploadRouter = Router();

uploadRouter.use(requireAuth);
uploadRouter.post("/", upload.single("file"), asyncHandler(uploadController.uploadFileHandler));
uploadRouter.post(
  "/kyc",
  requireRole("PROVIDER"),
  upload.single("file"),
  asyncHandler(uploadController.uploadKycFileHandler),
);
