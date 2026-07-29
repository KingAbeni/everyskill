import { Request, Response } from "express";
import * as reportService from "./report.service";
import { createReportSchema } from "./report.schemas";

export async function createReportHandler(req: Request, res: Response) {
  const input = createReportSchema.parse(req.body);
  const report = await reportService.createReport(req.user!.sub, input);
  res.status(201).json(report);
}

export async function listMyReportsHandler(req: Request, res: Response) {
  const reports = await reportService.listMyReports(req.user!.sub);
  res.status(200).json(reports);
}
