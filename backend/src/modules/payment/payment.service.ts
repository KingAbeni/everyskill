import crypto from "node:crypto";
import Stripe from "stripe";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import { env } from "../../config/env";
import { z } from "zod";
import { payBillSchema, payBookingSchema, withdrawSchema } from "./payment.schemas";
import { getPlatformSettings } from "../platform/platform.service";

type PayBookingInput = z.infer<typeof payBookingSchema>;
type WithdrawInput = z.infer<typeof withdrawSchema>;
type PayBillInput = z.infer<typeof payBillSchema>;

// Stripe's well-known test-mode PaymentMethod ids — no real card/account needed.
// pm_card_visa always succeeds; pm_card_chargeDeclined always fails (see docs/API.md).
const DEFAULT_TEST_PAYMENT_METHOD = "pm_card_visa";
const OFFLINE_BILL_GRACE_DAYS = 5;

const OFFLINE_PAYMENT_DISCLAIMER =
  "This is an offline payment made directly between you and the provider. EverySkill does not " +
  "guarantee, hold, or protect offline payments — there is no escrow and no refund process through " +
  "the platform if something goes wrong. Make sure to pay the provider the full amount owed.";

export function getStripeClient(): Stripe {
  if (!env.stripe.secretKey) {
    throw new AppError(500, "Escrow payments are not configured (missing STRIPE_SECRET_KEY)");
  }
  return new Stripe(env.stripe.secretKey);
}

async function getCustomerProfileOrThrow(userId: string) {
  const profile = await prisma.customerProfile.findUnique({ where: { userId } });
  if (!profile) {
    throw new AppError(404, "Customer profile not found");
  }
  return profile;
}

async function getProviderProfileOrThrow(userId: string) {
  const profile = await prisma.providerProfile.findUnique({ where: { userId } });
  if (!profile) {
    throw new AppError(404, "Provider profile not found");
  }
  return profile;
}

export async function calculateCommission(amount: number): Promise<{ commission: number; net: number }> {
  const settings = await getPlatformSettings();
  const commission = Math.round(amount * (Number(settings.commissionPercent) / 100) * 100) / 100;
  return { commission, net: Math.round((amount - commission) * 100) / 100 };
}

export async function creditProviderBalance(providerProfileId: string, amount: number) {
  await prisma.providerBalance.upsert({
    where: { providerProfileId },
    create: { providerProfileId, availableBalance: amount },
    update: { availableBalance: { increment: amount } },
  });
}

export async function createOfflineBill(
  providerProfileId: string,
  bookingId: string,
  sourceType: "BOOKING_PAYMENT" | "EXTRA_CHARGE",
  commissionAmount: number,
) {
  const dueAt = new Date(Date.now() + OFFLINE_BILL_GRACE_DAYS * 24 * 60 * 60 * 1000);
  return prisma.offlinePaymentBill.create({
    data: { providerProfileId, bookingId, sourceType, amount: commissionAmount, dueAt },
  });
}

export async function payForBooking(userId: string, bookingId: string, input: PayBookingInput) {
  const customerProfile = await getCustomerProfileOrThrow(userId);
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { payment: true } });
  if (!booking || booking.customerId !== customerProfile.id) {
    throw new AppError(404, "Booking not found");
  }
  if (booking.status !== "ACCEPTED") {
    throw new AppError(409, `Cannot pay for a booking in status ${booking.status} — it must be ACCEPTED first`);
  }
  if (booking.payment) {
    if (booking.payment.status !== "FAILED") {
      throw new AppError(409, "This booking already has a payment");
    }
    await prisma.payment.delete({ where: { bookingId } });
  }

  const amount = Number(booking.price);

  if (input.method === "offline") {
    const payment = await prisma.payment.create({
      data: { bookingId, amount: booking.price, gateway: "offline", status: "RELEASED", transactionRef: null },
    });
    const { commission } = await calculateCommission(amount);
    const bill = await createOfflineBill(booking.providerProfileId, bookingId, "BOOKING_PAYMENT", commission);
    return { payment, disclaimer: OFFLINE_PAYMENT_DISCLAIMER, amountDue: amount, platformBill: bill };
  }

  const stripe = getStripeClient();
  const amountCents = Math.round(amount * 100);
  const paymentMethod = input.paymentMethodId ?? DEFAULT_TEST_PAYMENT_METHOD;

  let intent: Stripe.PaymentIntent;
  try {
    intent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "usd",
      payment_method: paymentMethod,
      payment_method_types: ["card"],
      capture_method: "manual",
      confirm: true,
    });
  } catch (err) {
    const stripeError = err as Stripe.errors.StripeError;
    await prisma.payment.create({
      data: {
        bookingId,
        amount: booking.price,
        gateway: "stripe",
        status: "FAILED",
        transactionRef: stripeError.payment_intent?.id ?? null,
      },
    });
    throw new AppError(402, `Payment failed: ${stripeError.message}`);
  }

  const status = intent.status === "requires_capture" ? "ESCROW" : "FAILED";

  const payment = await prisma.payment.create({
    data: { bookingId, amount: booking.price, gateway: "stripe", status, transactionRef: intent.id },
  });

  if (status === "FAILED") {
    throw new AppError(402, `Payment failed: PaymentIntent ended in unexpected status "${intent.status}"`);
  }

  return payment;
}

/** Escrow -> Released, called when a booking is marked COMPLETED (FR11/FR12 status sync). No-op if unpaid. */
export async function releasePayment(bookingId: string) {
  const payment = await prisma.payment.findUnique({ where: { bookingId } });
  if (!payment || payment.status !== "ESCROW") {
    return;
  }
  const stripe = getStripeClient();
  await stripe.paymentIntents.capture(payment.transactionRef!);
  await prisma.payment.update({ where: { bookingId }, data: { status: "RELEASED" } });

  const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
  const { net } = await calculateCommission(Number(payment.amount));
  await creditProviderBalance(booking.providerProfileId, net);
}

/** Escrow -> Refunded, called when a booking is CANCELLED (FR11/FR12 status sync). No-op if unpaid. */
export async function refundPayment(bookingId: string) {
  const payment = await prisma.payment.findUnique({ where: { bookingId } });
  if (!payment || payment.status !== "ESCROW") {
    return;
  }
  const stripe = getStripeClient();
  await stripe.paymentIntents.cancel(payment.transactionRef!);
  await prisma.payment.update({ where: { bookingId }, data: { status: "REFUNDED" } });
}

export async function listProviderPayments(userId: string) {
  const profile = await getProviderProfileOrThrow(userId);
  return prisma.payment.findMany({
    where: { booking: { providerProfileId: profile.id } },
    include: { booking: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getProviderBalance(userId: string) {
  const profile = await getProviderProfileOrThrow(userId);
  const balance = await prisma.providerBalance.findUnique({ where: { providerProfileId: profile.id } });
  return balance ?? { providerProfileId: profile.id, availableBalance: 0 };
}

export async function withdrawBalance(userId: string, input: WithdrawInput) {
  const profile = await getProviderProfileOrThrow(userId);
  const balance = await prisma.providerBalance.findUnique({ where: { providerProfileId: profile.id } });
  const available = balance ? Number(balance.availableBalance) : 0;
  const amount = input.amount ?? available;

  if (amount <= 0) {
    throw new AppError(400, "Nothing available to withdraw");
  }
  if (!balance || amount > available) {
    throw new AppError(409, "Withdrawal amount exceeds available balance");
  }

  const withdrawalId = crypto.randomUUID();
  await prisma.$transaction([
    prisma.providerBalance.update({
      where: { providerProfileId: profile.id },
      data: { availableBalance: { decrement: amount } },
    }),
    prisma.withdrawalRequest.create({
      data: { id: withdrawalId, providerProfileId: profile.id, amount },
    }),
  ]);

  return prisma.withdrawalRequest.findUniqueOrThrow({ where: { id: withdrawalId } });
}

export async function listWithdrawals(userId: string) {
  const profile = await getProviderProfileOrThrow(userId);
  return prisma.withdrawalRequest.findMany({
    where: { providerProfileId: profile.id },
    orderBy: { createdAt: "desc" },
  });
}

export async function listProviderBills(userId: string) {
  const profile = await getProviderProfileOrThrow(userId);
  return prisma.offlinePaymentBill.findMany({
    where: { providerProfileId: profile.id },
    include: { booking: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function payBill(userId: string, billId: string, input: PayBillInput) {
  const profile = await getProviderProfileOrThrow(userId);
  const bill = await prisma.offlinePaymentBill.findUnique({ where: { id: billId } });
  if (!bill || bill.providerProfileId !== profile.id) {
    throw new AppError(404, "Bill not found");
  }
  if (bill.status === "PAID") {
    throw new AppError(409, "This bill has already been paid");
  }

  const owed = Number(bill.amount);

  if (input.method === "balance") {
    const balance = await prisma.providerBalance.findUnique({ where: { providerProfileId: profile.id } });
    const available = balance ? Number(balance.availableBalance) : 0;
    if (available < owed) {
      throw new AppError(409, "Insufficient balance to cover this bill");
    }
    await prisma.$transaction([
      prisma.providerBalance.update({
        where: { providerProfileId: profile.id },
        data: { availableBalance: { decrement: owed } },
      }),
      prisma.offlinePaymentBill.update({
        where: { id: billId },
        data: { status: "PAID", paidAt: new Date(), paidVia: "balance" },
      }),
    ]);
  } else {
    const stripe = getStripeClient();
    const paymentMethod = input.paymentMethodId ?? DEFAULT_TEST_PAYMENT_METHOD;
    let intent: Stripe.PaymentIntent;
    try {
      intent = await stripe.paymentIntents.create({
        amount: Math.round(owed * 100),
        currency: "usd",
        payment_method: paymentMethod,
        payment_method_types: ["card"],
        capture_method: "automatic",
        confirm: true,
      });
    } catch (err) {
      const stripeError = err as Stripe.errors.StripeError;
      throw new AppError(402, `Bill payment failed: ${stripeError.message}`);
    }
    if (intent.status !== "succeeded") {
      throw new AppError(402, `Bill payment failed: PaymentIntent ended in status "${intent.status}"`);
    }
    await prisma.offlinePaymentBill.update({
      where: { id: billId },
      data: { status: "PAID", paidAt: new Date(), paidVia: "stripe" },
    });
  }

  const remainingOverdue = await prisma.offlinePaymentBill.count({
    where: { providerProfileId: profile.id, status: { in: ["PENDING", "OVERDUE"] } },
  });
  if (remainingOverdue === 0) {
    await prisma.user.updateMany({ where: { id: profile.userId, status: "SUSPENDED" }, data: { status: "ACTIVE" } });
  }

  return prisma.offlinePaymentBill.findUniqueOrThrow({ where: { id: billId } });
}
