import { Request, Response } from "express";
import * as adminService from "./admin.service";
import * as platformService from "../platform/platform.service";
import * as disputeService from "../dispute/dispute.service";
import * as reportService from "../report/report.service";
import * as notificationService from "../notification/notification.service";
import {
  createAdminSchema,
  forceResetAdminPasswordSchema,
  listAuditLogQuerySchema,
  listKycQuerySchema,
  listUsersQuerySchema,
  reviewKycSchema,
  updatePlatformSettingsSchema,
} from "./admin.schemas";
import { listDisputesQuerySchema, resolveDisputeSchema } from "../dispute/dispute.schemas";
import { actionReportSchema, listReportsQuerySchema } from "../report/report.schemas";
import { listNotificationsQuerySchema } from "../notification/notification.schemas";

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

export async function getPlatformSettingsHandler(req: Request, res: Response) {
  const settings = await platformService.getPlatformSettings();
  res.status(200).json(settings);
}

export async function updatePlatformSettingsHandler(req: Request, res: Response) {
  const input = updatePlatformSettingsSchema.parse(req.body);
  const settings = await platformService.updateCommissionPercent(req.user!.sub, input.commissionPercent);
  res.status(200).json(settings);
}

export async function reactivateUserHandler(req: Request, res: Response) {
  const user = await adminService.reactivateUser(req.user!.sub, req.params.userId);
  res.status(200).json(user);
}

export async function listDisputesHandler(req: Request, res: Response) {
  const query = listDisputesQuerySchema.parse(req.query);
  const disputes = await disputeService.listDisputes(query);
  res.status(200).json(disputes);
}

export async function getDisputeHandler(req: Request, res: Response) {
  const dispute = await disputeService.getDispute(req.params.disputeId);
  res.status(200).json(dispute);
}

export async function markDisputeUnderReviewHandler(req: Request, res: Response) {
  const dispute = await disputeService.markUnderReview(req.params.disputeId);
  res.status(200).json(dispute);
}

export async function resolveDisputeHandler(req: Request, res: Response) {
  const input = resolveDisputeSchema.parse(req.body);
  const dispute = await disputeService.resolveDispute(req.user!.sub, req.params.disputeId, input);
  res.status(200).json(dispute);
}

export async function listReportsHandler(req: Request, res: Response) {
  const query = listReportsQuerySchema.parse(req.query);
  const reports = await reportService.listReports(query);
  res.status(200).json(reports);
}

export async function getReportHandler(req: Request, res: Response) {
  const report = await reportService.getReport(req.params.reportId);
  res.status(200).json(report);
}

export async function markReportReviewedHandler(req: Request, res: Response) {
  const report = await reportService.markReportReviewed(req.user!.sub, req.params.reportId);
  res.status(200).json(report);
}

export async function actionReportHandler(req: Request, res: Response) {
  const input = actionReportSchema.parse(req.body);
  const report = await reportService.actionReport(req.user!.sub, req.params.reportId, input);
  res.status(200).json(report);
}

export async function listUsersHandler(req: Request, res: Response) {
  const query = listUsersQuerySchema.parse(req.query);
  const users = await adminService.listUsers(query);
  res.status(200).json(users);
}

export async function listReviewsHandler(req: Request, res: Response) {
  const reviews = await adminService.listReviewsForAdmin();
  res.status(200).json(reviews);
}

export async function listAuditLogHandler(req: Request, res: Response) {
  const query = listAuditLogQuerySchema.parse(req.query);
  const entries = await adminService.listAuditLog(query);
  res.status(200).json(entries);
}

export async function getAnalyticsHandler(req: Request, res: Response) {
  const analytics = await adminService.getPlatformAnalytics();
  res.status(200).json(analytics);
}

export async function getDashboardHandler(req: Request, res: Response) {
  const dashboard = await adminService.getDashboard();
  res.status(200).json(dashboard);
}

export async function listNotificationsHandler(req: Request, res: Response) {
  const query = listNotificationsQuerySchema.parse(req.query);
  const notifications = await notificationService.listMyNotifications(req.user!.sub, query);
  res.status(200).json(notifications);
}

export async function getNotificationsUnreadCountHandler(req: Request, res: Response) {
  const result = await notificationService.getUnreadCount(req.user!.sub);
  res.status(200).json(result);
}

export async function markNotificationReadHandler(req: Request, res: Response) {
  const notification = await notificationService.markAsRead(req.user!.sub, req.params.notificationId);
  res.status(200).json(notification);
}

export async function markAllNotificationsReadHandler(req: Request, res: Response) {
  const result = await notificationService.markAllAsRead(req.user!.sub);
  res.status(200).json(result);
}
