import crypto from "node:crypto";
import QRCode from "qrcode";
import { QrTokenKind } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import {
  getCustomerProfileOrThrow,
  getOwnedCustomerBookingOrThrow,
  getOwnedProviderBookingOrThrow,
  getProviderProfileOrThrow,
  markBookingAwaitingConfirmationViaQr,
  markBookingInProgressViaQr,
  finalizeBookingCompletion,
} from "./booking.service";

const QR_EXPIRY_MS = 15 * 60 * 1000;

function generateSecureToken(): string {
  // 256 bits of entropy, no provider/customer/booking ID embedded — per the security requirement
  // that a QR payload must never be guessable or reversible to an identity.
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

function encodePayload(bookingId: string, rawToken: string): string {
  return Buffer.from(JSON.stringify({ bookingId, token: rawToken }), "utf8").toString("base64url");
}

function decodePayload(payload: string): { bookingId: string; token: string } {
  try {
    const decoded: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (
      typeof decoded !== "object" ||
      decoded === null ||
      typeof (decoded as Record<string, unknown>).bookingId !== "string" ||
      typeof (decoded as Record<string, unknown>).token !== "string"
    ) {
      throw new Error("malformed");
    }
    return decoded as { bookingId: string; token: string };
  } catch {
    throw new AppError(400, "Invalid QR code payload");
  }
}

async function generateToken(bookingId: string, kind: QrTokenKind, generatedById: string) {
  // Never more than one live token per (booking, kind) — invalidate any still-pending predecessor first.
  await prisma.bookingQrToken.updateMany({
    where: { bookingId, kind, status: "PENDING" },
    data: { status: "INVALIDATED" },
  });

  const rawToken = generateSecureToken();
  const expiresAt = new Date(Date.now() + QR_EXPIRY_MS);
  await prisma.bookingQrToken.create({
    data: { bookingId, kind, tokenHash: hashToken(rawToken), expiresAt, generatedById },
  });

  const payload = encodePayload(bookingId, rawToken);
  const qrImageDataUrl = await QRCode.toDataURL(payload);
  return { token: payload, qrImageDataUrl, expiresAt };
}

/** Looks up, validates, and marks USED the most recent PENDING token of this kind — single-use, replay-proof. */
async function consumeToken(bookingId: string, kind: QrTokenKind, payload: string, usedById: string) {
  const decoded = decodePayload(payload);
  if (decoded.bookingId !== bookingId) {
    throw new AppError(400, "This QR code does not belong to this booking");
  }

  const candidate = await prisma.bookingQrToken.findFirst({
    where: { bookingId, kind, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
  if (!candidate) {
    throw new AppError(400, "No pending QR code found for this booking — it may already have been used or replaced");
  }
  if (candidate.expiresAt.getTime() < Date.now()) {
    await prisma.bookingQrToken.update({ where: { id: candidate.id }, data: { status: "EXPIRED" } });
    throw new AppError(400, "This QR code has expired");
  }

  const candidateHash = Buffer.from(candidate.tokenHash, "hex");
  const suppliedHash = Buffer.from(hashToken(decoded.token), "hex");
  const matches = candidateHash.length === suppliedHash.length && crypto.timingSafeEqual(candidateHash, suppliedHash);
  if (!matches) {
    throw new AppError(400, "Invalid QR code");
  }

  await prisma.bookingQrToken.update({
    where: { id: candidate.id },
    data: { status: "USED", usedById, usedAt: new Date() },
  });
}

export async function generateArrivalQr(userId: string, bookingId: string) {
  const profile = await getProviderProfileOrThrow(userId);
  const booking = await getOwnedProviderBookingOrThrow(profile.id, bookingId);
  if (!booking.listing.requiresQrVerification) {
    throw new AppError(409, "This listing does not require QR verification");
  }
  if (booking.status !== "ACCEPTED") {
    throw new AppError(409, `Cannot generate an arrival QR for a booking in status ${booking.status}`);
  }
  return generateToken(bookingId, "ARRIVAL", userId);
}

/** Only the booking's customer may call this — enforced via getOwnedCustomerBookingOrThrow. */
export async function validateArrivalQr(userId: string, bookingId: string, token: string) {
  const profile = await getCustomerProfileOrThrow(userId);
  const booking = await getOwnedCustomerBookingOrThrow(profile.id, bookingId);
  if (booking.status !== "ACCEPTED") {
    throw new AppError(409, `Cannot validate an arrival QR for a booking in status ${booking.status}`);
  }
  await consumeToken(bookingId, "ARRIVAL", token, userId);
  return markBookingInProgressViaQr(bookingId, userId);
}

export async function generateCompletionQr(userId: string, bookingId: string) {
  const profile = await getProviderProfileOrThrow(userId);
  const booking = await getOwnedProviderBookingOrThrow(profile.id, bookingId);
  if (!booking.listing.requiresQrVerification) {
    throw new AppError(409, "This listing does not require QR verification");
  }
  if (booking.status !== "IN_PROGRESS") {
    throw new AppError(409, `Cannot generate a completion QR for a booking in status ${booking.status}`);
  }
  // Brand-new token, brand-new status transition — never reuses the arrival token (per requirement).
  await markBookingAwaitingConfirmationViaQr(bookingId, userId);
  return generateToken(bookingId, "COMPLETION", userId);
}

/** Only the booking's customer may call this — enforced via getOwnedCustomerBookingOrThrow. */
export async function validateCompletionQr(userId: string, bookingId: string, token: string) {
  const profile = await getCustomerProfileOrThrow(userId);
  const booking = await getOwnedCustomerBookingOrThrow(profile.id, bookingId);
  if (booking.status !== "WAITING_FOR_CONFIRMATION") {
    throw new AppError(409, `Cannot validate a completion QR for a booking in status ${booking.status}`);
  }
  await consumeToken(bookingId, "COMPLETION", token, userId);
  return finalizeBookingCompletion(bookingId, userId);
}
