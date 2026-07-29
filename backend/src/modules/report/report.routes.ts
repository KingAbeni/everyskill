import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import * as reportController from "./report.controller";

export const reportRouter = Router();

reportRouter.use(requireAuth);

reportRouter.post("/", asyncHandler(reportController.createReportHandler));
reportRouter.get("/mine", asyncHandler(reportController.listMyReportsHandler));
