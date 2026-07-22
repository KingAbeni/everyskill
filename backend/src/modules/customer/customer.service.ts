import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import {
  addFavoriteSchema,
  createAddressSchema,
  recordConsentSchema,
  updateAddressSchema,
  updateProfileSchema,
} from "./customer.schemas";
import { z } from "zod";

type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
type CreateAddressInput = z.infer<typeof createAddressSchema>;
type UpdateAddressInput = z.infer<typeof updateAddressSchema>;

async function getProfileOrThrow(userId: string) {
  const profile = await prisma.customerProfile.findUnique({ where: { userId } });
  if (!profile) {
    throw new AppError(404, "Customer profile not found");
  }
  return profile;
}

export async function getMyProfile(userId: string) {
  const profile = await getProfileOrThrow(userId);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return {
    id: profile.id,
    email: user.email,
    firstName: profile.firstName,
    lastName: profile.lastName,
    phone: profile.phone,
    avatarUrl: profile.avatarUrl,
    privacyPreferences: profile.privacyPreferences,
  };
}

export async function updateMyProfile(userId: string, input: UpdateProfileInput) {
  const profile = await getProfileOrThrow(userId);
  return prisma.customerProfile.update({
    where: { id: profile.id },
    data: { ...input, privacyPreferences: input.privacyPreferences as Prisma.InputJsonValue | undefined },
  });
}

export async function listAddresses(userId: string) {
  const profile = await getProfileOrThrow(userId);
  return prisma.address.findMany({ where: { customerProfileId: profile.id } });
}

export async function createAddress(userId: string, input: CreateAddressInput) {
  const profile = await getProfileOrThrow(userId);

  if (input.isDefault) {
    await prisma.address.updateMany({
      where: { customerProfileId: profile.id },
      data: { isDefault: false },
    });
  }

  return prisma.address.create({
    data: { ...input, customerProfileId: profile.id },
  });
}

async function getOwnedAddressOrThrow(userId: string, addressId: string) {
  const profile = await getProfileOrThrow(userId);
  const address = await prisma.address.findUnique({ where: { id: addressId } });
  if (!address || address.customerProfileId !== profile.id) {
    throw new AppError(404, "Address not found");
  }
  return { profile, address };
}

export async function updateAddress(userId: string, addressId: string, input: UpdateAddressInput) {
  const { profile } = await getOwnedAddressOrThrow(userId, addressId);

  if (input.isDefault) {
    await prisma.address.updateMany({
      where: { customerProfileId: profile.id },
      data: { isDefault: false },
    });
  }

  return prisma.address.update({ where: { id: addressId }, data: input });
}

export async function deleteAddress(userId: string, addressId: string) {
  await getOwnedAddressOrThrow(userId, addressId);
  await prisma.address.delete({ where: { id: addressId } });
}

export async function listFavorites(userId: string) {
  const profile = await getProfileOrThrow(userId);
  return prisma.favoriteProvider.findMany({
    where: { customerProfileId: profile.id },
    include: { providerProfile: true },
  });
}

export async function addFavorite(userId: string, input: z.infer<typeof addFavoriteSchema>) {
  const profile = await getProfileOrThrow(userId);

  const providerProfile = await prisma.providerProfile.findUnique({
    where: { id: input.providerProfileId },
  });
  if (!providerProfile) {
    throw new AppError(404, "Provider not found");
  }

  return prisma.favoriteProvider.upsert({
    where: {
      customerProfileId_providerProfileId: {
        customerProfileId: profile.id,
        providerProfileId: input.providerProfileId,
      },
    },
    create: { customerProfileId: profile.id, providerProfileId: input.providerProfileId },
    update: {},
  });
}

export async function removeFavorite(userId: string, providerProfileId: string) {
  const profile = await getProfileOrThrow(userId);
  await prisma.favoriteProvider.deleteMany({
    where: { customerProfileId: profile.id, providerProfileId },
  });
}

export async function listBookings(userId: string) {
  const profile = await getProfileOrThrow(userId);
  return prisma.booking.findMany({
    where: { customerId: profile.id },
    include: { listing: true, providerProfile: true, payment: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function listPayments(userId: string) {
  const profile = await getProfileOrThrow(userId);
  return prisma.payment.findMany({
    where: { booking: { customerId: profile.id } },
    include: { booking: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function listConsents(userId: string) {
  return prisma.consentRecord.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function recordConsent(userId: string, input: z.infer<typeof recordConsentSchema>) {
  return prisma.consentRecord.create({
    data: { userId, consentType: input.consentType, granted: input.granted },
  });
}

export async function exportMyData(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const profile = await getProfileOrThrow(userId);

  const [addresses, favorites, consents, bookings, payments, reviews] = await Promise.all([
    prisma.address.findMany({ where: { customerProfileId: profile.id } }),
    prisma.favoriteProvider.findMany({ where: { customerProfileId: profile.id } }),
    prisma.consentRecord.findMany({ where: { userId } }),
    prisma.booking.findMany({ where: { customerId: profile.id } }),
    prisma.payment.findMany({ where: { booking: { customerId: profile.id } } }),
    prisma.review.findMany({ where: { customerId: profile.id } }),
  ]);

  return {
    account: { id: user.id, email: user.email, role: user.role, createdAt: user.createdAt },
    profile,
    addresses,
    favoriteProviders: favorites,
    consentHistory: consents,
    bookings,
    payments,
    reviews,
  };
}

export async function requestAccountDeletion(userId: string) {
  const profile = await getProfileOrThrow(userId);

  await prisma.$transaction([
    prisma.address.deleteMany({ where: { customerProfileId: profile.id } }),
    prisma.favoriteProvider.deleteMany({ where: { customerProfileId: profile.id } }),
    prisma.customerProfile.update({
      where: { id: profile.id },
      data: {
        firstName: "Deleted",
        lastName: "User",
        phone: null,
        avatarUrl: null,
        privacyPreferences: Prisma.DbNull,
      },
    }),
    prisma.user.update({
      where: { id: userId },
      data: {
        email: `deleted-${userId}@deleted.everyskill.local`,
        passwordHash: null,
        refreshTokenHash: null,
        deletedAt: new Date(),
      },
    }),
  ]);
}
