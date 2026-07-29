import Stripe from "stripe";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import { z } from "zod";
import { createExtraChargeSchema, payExtraChargeSchema, respondExtraChargeSchema } from "./extraCharge.schemas";
import { calculateCommission, createOfflineBill, creditProviderBalance, getStripeClient } from "../payment/payment.service";
import { notify, NotificationType } from "../notification/notification.service";

type CreateExtraChargeInput = z.infer<typeof createExtraChargeSchema>;
type RespondExtraChargeInput = z.infer<typeof respondExtraChargeSchema>;
type PayExtraChargeInput = z.infer<typeof payExtraChargeSchema>;

const DEFAULT_TEST_PAYMENT_METHOD = "pm_card_visa";

const OFFLINE_PAYMENT_DISCLAIMER =
  "This is an offline payment made directly between you and the provider. EverySkill does not " +
  "guarantee, hold, or protect offline payments — there is no escrow and no refund process through " +
  "the platform if something goes wrong. Make sure to pay the provider the full amount owed.";

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

export async function requestExtraCharge(userId: string, bookingId: string, input: CreateExtraChargeInput) {
  const profile = await getProviderProfileOrThrow(userId);
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { customer: true } });
  if (!booking || booking.providerProfileId !== profile.id) {
    throw new AppError(404, "Booking not found");
  }
  if (booking.status !== "ACCEPTED" && booking.status !== "IN_PROGRESS") {
    throw new AppError(409, `Cannot request an extra charge for a booking in status ${booking.status}`);
  }

  const charge = await prisma.extraCharge.create({
    data: {
      bookingId,
      amount: input.amount,
      reason: input.reason,
      requestedById: userId,
    },
  });
  await notify(
    booking.customer.userId,
    NotificationType.EXTRA_CHARGE_REQUESTED,
    `The provider requested an extra charge of $${input.amount} for: ${input.reason}`,
    bookingId,
  );
  return charge;
}

async function getOwnedExtraChargeForCustomer(userId: string, bookingId: string, chargeId: string) {
  const profile = await getCustomerProfileOrThrow(userId);
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { providerProfile: true } });
  if (!booking || booking.customerId !== profile.id) {
    throw new AppError(404, "Booking not found");
  }
  const charge = await prisma.extraCharge.findUnique({ where: { id: chargeId } });
  if (!charge || charge.bookingId !== bookingId) {
    throw new AppError(404, "Extra charge not found");
  }
  return { booking, charge };
}

export async function respondToExtraCharge(
  userId: string,
  bookingId: string,
  chargeId: string,
  input: RespondExtraChargeInput,
) {
  const { booking, charge } = await getOwnedExtraChargeForCustomer(userId, bookingId, chargeId);
  if (charge.status !== "PENDING") {
    throw new AppError(409, `This extra charge has already been ${charge.status.toLowerCase()}`);
  }

  if (!input.approve) {
    const rejected = await prisma.extraCharge.update({
      where: { id: chargeId },
      data: { status: "REJECTED", respondedAt: new Date() },
    });
    await notify(
      booking.providerProfile.userId,
      NotificationType.EXTRA_CHARGE_RESPONDED,
      "Your extra charge request was rejected",
      bookingId,
    );
    return rejected;
  }

  const [updated] = await prisma.$transaction([
    prisma.extraCharge.update({
      where: { id: chargeId },
      data: { status: "APPROVED", respondedAt: new Date() },
    }),
    prisma.booking.update({
      where: { id: bookingId },
      data: { price: { increment: charge.amount } },
    }),
  ]);
  await notify(
    booking.providerProfile.userId,
    NotificationType.EXTRA_CHARGE_RESPONDED,
    "Your extra charge request was approved",
    bookingId,
  );
  return updated;
}

export async function payExtraCharge(userId: string, bookingId: string, chargeId: string, input: PayExtraChargeInput) {
  const { charge } = await getOwnedExtraChargeForCustomer(userId, bookingId, chargeId);
  if (charge.status !== "APPROVED") {
    throw new AppError(409, "This extra charge must be approved before it can be paid");
  }
  if (charge.paymentStatus && charge.paymentStatus !== "FAILED") {
    throw new AppError(409, "This extra charge has already been paid");
  }

  const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
  const amount = Number(charge.amount);

  if (input.method === "offline") {
    const updated = await prisma.extraCharge.update({
      where: { id: chargeId },
      data: { paymentStatus: "RELEASED", gateway: "offline", transactionRef: null },
    });
    const { commission } = await calculateCommission(amount);
    const bill = await createOfflineBill(booking.providerProfileId, bookingId, "EXTRA_CHARGE", commission);
    return { extraCharge: updated, disclaimer: OFFLINE_PAYMENT_DISCLAIMER, amountDue: amount, platformBill: bill };
  }

  const stripe = getStripeClient();
  const paymentMethod = input.paymentMethodId ?? DEFAULT_TEST_PAYMENT_METHOD;

  let intent: Stripe.PaymentIntent;
  try {
    intent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: "usd",
      payment_method: paymentMethod,
      payment_method_types: ["card"],
      capture_method: "automatic",
      confirm: true,
    });
  } catch (err) {
    const stripeError = err as Stripe.errors.StripeError;
    await prisma.extraCharge.update({
      where: { id: chargeId },
      data: { paymentStatus: "FAILED", gateway: "stripe", transactionRef: stripeError.payment_intent?.id ?? null },
    });
    throw new AppError(402, `Payment failed: ${stripeError.message}`);
  }

  if (intent.status !== "succeeded") {
    await prisma.extraCharge.update({
      where: { id: chargeId },
      data: { paymentStatus: "FAILED", gateway: "stripe", transactionRef: intent.id },
    });
    throw new AppError(402, `Payment failed: PaymentIntent ended in unexpected status "${intent.status}"`);
  }

  const updated = await prisma.extraCharge.update({
    where: { id: chargeId },
    data: { paymentStatus: "RELEASED", gateway: "stripe", transactionRef: intent.id },
  });

  const { net } = await calculateCommission(amount);
  await creditProviderBalance(booking.providerProfileId, net);

  return updated;
}
