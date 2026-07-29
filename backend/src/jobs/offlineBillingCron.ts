import cron from "node-cron";
import { prisma } from "../config/prisma";
import { notify, NotificationType } from "../modules/notification/notification.service";

/**
 * Finds offline-payment commission bills past their due date, marks them OVERDUE, and
 * suspends the owing provider's account. Deliberately does NOT revoke the refresh token:
 * fresh login is blocked for SUSPENDED accounts (see auth.service.ts), so if the refresh
 * token were also revoked, a provider with no other active session would have no way back
 * into the API at all — not even to pay off the bill and get reinstated. Keeping the refresh
 * token alive means an existing session can still reach GET/POST /providers/me/bills to settle
 * up, after which they're automatically reactivated (see payment.service.ts's payBill).
 * Exported separately from the cron registration so it can also be invoked on-demand (e.g. in
 * tests) without waiting for the schedule to fire.
 */
export async function suspendOverdueProviders(): Promise<number> {
  const now = new Date();
  const overdueBills = await prisma.offlinePaymentBill.findMany({
    where: { status: "PENDING", dueAt: { lt: now } },
    include: { providerProfile: true },
  });

  for (const bill of overdueBills) {
    await prisma.offlinePaymentBill.update({ where: { id: bill.id }, data: { status: "OVERDUE" } });
    await prisma.user.update({
      where: { id: bill.providerProfile.userId },
      data: { status: "SUSPENDED" },
    });
    await notify(
      bill.providerProfile.userId,
      NotificationType.ACCOUNT_SUSPENDED,
      "Your account was suspended for an overdue platform commission bill. Pay your bill to be reactivated.",
      bill.bookingId,
    );
  }

  return overdueBills.length;
}

/** Runs once a day at midnight server time. */
export function startOfflineBillingCron() {
  cron.schedule("0 0 * * *", () => {
    suspendOverdueProviders().catch((err) => {
      console.error("offline billing cron failed:", err);
    });
  });
}
