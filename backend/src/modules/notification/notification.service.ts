import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import { z } from "zod";
import { listNotificationsQuerySchema } from "./notification.schemas";

type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

/**
 * Every notification "kind" this platform raises (FR15). Kept as a plain string union rather than
 * a Prisma enum, since Notification.type is a free-text column — new kinds can be added here
 * without a migration.
 */
export const NotificationType = {
  BOOKING_REQUESTED: "BOOKING_REQUESTED",
  BOOKING_ACCEPTED: "BOOKING_ACCEPTED",
  BOOKING_DECLINED: "BOOKING_DECLINED",
  BOOKING_STARTED: "BOOKING_STARTED",
  BOOKING_COMPLETED: "BOOKING_COMPLETED",
  BOOKING_CANCELLED: "BOOKING_CANCELLED",
  BOOKING_NO_SHOW: "BOOKING_NO_SHOW",
  RESCHEDULE_PROPOSED: "RESCHEDULE_PROPOSED",
  RESCHEDULE_RESPONDED: "RESCHEDULE_RESPONDED",
  MESSAGE_RECEIVED: "MESSAGE_RECEIVED",
  PAYMENT_RECEIVED: "PAYMENT_RECEIVED",
  PAYMENT_RELEASED: "PAYMENT_RELEASED",
  PAYMENT_REFUNDED: "PAYMENT_REFUNDED",
  EXTRA_CHARGE_REQUESTED: "EXTRA_CHARGE_REQUESTED",
  EXTRA_CHARGE_RESPONDED: "EXTRA_CHARGE_RESPONDED",
  BILL_CREATED: "BILL_CREATED",
  KYC_REVIEWED: "KYC_REVIEWED",
  DISPUTE_OPENED: "DISPUTE_OPENED",
  DISPUTE_RESOLVED: "DISPUTE_RESOLVED",
  REVIEW_RECEIVED: "REVIEW_RECEIVED",
  REVIEW_REPLIED: "REVIEW_REPLIED",
  REPORT_FILED: "REPORT_FILED",
  WARNING_ISSUED: "WARNING_ISSUED",
  ACCOUNT_BANNED: "ACCOUNT_BANNED",
  ACCOUNT_SUSPENDED: "ACCOUNT_SUSPENDED",
  ACCOUNT_REACTIVATED: "ACCOUNT_REACTIVATED",
  PROMOTION_LAUNCHED: "PROMOTION_LAUNCHED",
  BOOKING_AWAITING_CONFIRMATION: "BOOKING_AWAITING_CONFIRMATION",
  BOOKING_ARRIVAL_CONFIRMED: "BOOKING_ARRIVAL_CONFIRMED",
  TIER_UPGRADED: "TIER_UPGRADED",
  ACHIEVEMENT_EARNED: "ACHIEVEMENT_EARNED",
} as const;

export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

/**
 * Fire-and-forget in-app notification, called directly from other modules' services (same
 * cross-module pattern already used by dispute.service.ts importing booking/payment). Channel is
 * always IN_APP for now — Push/Email/SMS are modeled on NotificationChannel but have no sender
 * wired up yet (see docs/API.md for scope notes).
 */
export async function notify(userId: string, type: NotificationType, content: string, referenceId?: string) {
  return prisma.notification.create({
    data: { userId, type, channel: "IN_APP", content, referenceId: referenceId ?? null },
  });
}

export async function listMyNotifications(userId: string, query: ListNotificationsQuery) {
  return prisma.notification.findMany({
    where: { userId, ...(query.unreadOnly ? { isRead: false } : {}) },
    orderBy: { createdAt: "desc" },
  });
}

export async function getUnreadCount(userId: string) {
  const unreadCount = await prisma.notification.count({ where: { userId, isRead: false } });
  return { unreadCount };
}

async function getOwnedNotificationOrThrow(userId: string, notificationId: string) {
  const notification = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!notification || notification.userId !== userId) {
    throw new AppError(404, "Notification not found");
  }
  return notification;
}

export async function markAsRead(userId: string, notificationId: string) {
  await getOwnedNotificationOrThrow(userId, notificationId);
  return prisma.notification.update({ where: { id: notificationId }, data: { isRead: true } });
}

export async function markAllAsRead(userId: string) {
  const result = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
  return { updated: result.count };
}
