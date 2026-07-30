import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import { z } from "zod";
import { createPromotionSchema, updatePromotionSchema } from "./promotion.schemas";
import { notify, NotificationType } from "../notification/notification.service";

type CreatePromotionInput = z.infer<typeof createPromotionSchema>;
type UpdatePromotionInput = z.infer<typeof updatePromotionSchema>;
type PromotionDetails = { percentOff?: number; amountOff?: number };

async function getProviderProfileOrThrow(userId: string) {
  const profile = await prisma.providerProfile.findUnique({ where: { userId } });
  if (!profile) {
    throw new AppError(404, "Provider profile not found");
  }
  return profile;
}

async function getOwnedPromotionOrThrow(userId: string, promotionId: string) {
  const profile = await getProviderProfileOrThrow(userId);
  const promotion = await prisma.promotion.findUnique({ where: { id: promotionId } });
  if (!promotion || promotion.providerProfileId !== profile.id) {
    throw new AppError(404, "Promotion not found");
  }
  return promotion;
}

/** DISCOUNT/COUPON/CAMPAIGN all notify — FavoriteProvider already models "customers who care about this provider". */
async function notifyFavoritedCustomers(providerProfileId: string, type: string) {
  const favorites = await prisma.favoriteProvider.findMany({
    where: { providerProfileId },
    include: { customerProfile: { select: { userId: true } } },
  });
  const label = type === "CAMPAIGN" ? "campaign" : type === "COUPON" ? "coupon" : "discount";
  await Promise.all(
    favorites.map((favorite) =>
      notify(
        favorite.customerProfile.userId,
        NotificationType.PROMOTION_LAUNCHED,
        `A provider you've favorited just launched a new ${label}`,
      ),
    ),
  );
}

export async function createPromotion(userId: string, input: CreatePromotionInput) {
  const profile = await getProviderProfileOrThrow(userId);
  const promotion = await prisma.promotion.create({
    data: {
      providerProfileId: profile.id,
      type: input.type,
      code: input.type === "COUPON" ? input.code : null,
      details: input.details as Prisma.InputJsonValue,
      validFrom: input.validFrom,
      validTo: input.validTo,
      maxRedemptions: input.type === "CAMPAIGN" ? null : (input.maxRedemptions ?? null),
    },
  });

  await notifyFavoritedCustomers(profile.id, promotion.type);

  return promotion;
}

export async function listMyPromotions(userId: string) {
  const profile = await getProviderProfileOrThrow(userId);
  return prisma.promotion.findMany({ where: { providerProfileId: profile.id }, orderBy: { createdAt: "desc" } });
}

export async function updatePromotion(userId: string, promotionId: string, input: UpdatePromotionInput) {
  const promotion = await getOwnedPromotionOrThrow(userId, promotionId);
  const validFrom = input.validFrom ?? promotion.validFrom;
  const validTo = input.validTo ?? promotion.validTo;
  if (validFrom >= validTo) {
    throw new AppError(400, "validFrom must be before validTo");
  }

  return prisma.promotion.update({
    where: { id: promotionId },
    data: {
      details: input.details !== undefined ? (input.details as Prisma.InputJsonValue) : undefined,
      validFrom: input.validFrom,
      validTo: input.validTo,
      isActive: input.isActive,
      maxRedemptions: input.maxRedemptions,
    },
  });
}

export async function deletePromotion(userId: string, promotionId: string) {
  const promotion = await getOwnedPromotionOrThrow(userId, promotionId);
  if (promotion.timesRedeemed > 0) {
    throw new AppError(409, "Cannot delete a promotion that has already been redeemed — deactivate it instead (isActive: false)");
  }
  await prisma.promotion.delete({ where: { id: promotionId } });
}

/**
 * FR9/FR16-style batched public attachment — computes active DISCOUNT/CAMPAIGN promotions per
 * provider in one query for a whole listing search result set. COUPON is deliberately excluded:
 * a coupon code must be told to the customer out-of-band, never leaked via a public API response.
 */
export async function getActivePromotionsForProviders(providerProfileIds: string[]) {
  if (providerProfileIds.length === 0) {
    return new Map<string, Awaited<ReturnType<typeof prisma.promotion.findMany>>>();
  }
  const now = new Date();
  const promotions = await prisma.promotion.findMany({
    where: {
      providerProfileId: { in: providerProfileIds },
      type: { in: ["DISCOUNT", "CAMPAIGN"] },
      isActive: true,
      validFrom: { lte: now },
      validTo: { gte: now },
    },
  });

  const map = new Map<string, typeof promotions>();
  for (const promotion of promotions) {
    const arr = map.get(promotion.providerProfileId);
    if (arr) {
      arr.push(promotion);
    } else {
      map.set(promotion.providerProfileId, [promotion]);
    }
  }
  return map;
}

function computeDiscountAmount(price: number, details: PromotionDetails): number {
  if (details.percentOff !== undefined) {
    return Math.round(price * (details.percentOff / 100) * 100) / 100;
  }
  if (details.amountOff !== undefined) {
    return Math.min(details.amountOff, price);
  }
  return 0;
}

/**
 * FR26 booking-time resolution (called from booking.service.ts's createBooking):
 * - couponCode given: must resolve to a valid, active, non-exhausted COUPON — throws 400 if not
 *   (explicit rejection, since the customer opted in; never silently ignored).
 * - no couponCode: looks for active, non-exhausted DISCOUNT promotions and applies the single
 *   best one (largest discount amount) if any exist. Returns null if none apply — not an error.
 */
export async function resolveBookingPromotion(providerProfileId: string, price: number, couponCode?: string) {
  const now = new Date();

  if (couponCode) {
    const coupon = await prisma.promotion.findFirst({
      where: {
        providerProfileId,
        type: "COUPON",
        code: couponCode,
        isActive: true,
        validFrom: { lte: now },
        validTo: { gte: now },
      },
    });
    if (!coupon) {
      throw new AppError(400, "Invalid or expired coupon code");
    }
    if (coupon.maxRedemptions !== null && coupon.timesRedeemed >= coupon.maxRedemptions) {
      throw new AppError(400, "This coupon has reached its redemption limit");
    }
    const discountAmount = computeDiscountAmount(price, (coupon.details as PromotionDetails) ?? {});
    return { promotionId: coupon.id, discountAmount };
  }

  const discounts = await prisma.promotion.findMany({
    where: {
      providerProfileId,
      type: "DISCOUNT",
      isActive: true,
      validFrom: { lte: now },
      validTo: { gte: now },
    },
  });
  const eligible = discounts.filter((d) => d.maxRedemptions === null || d.timesRedeemed < d.maxRedemptions);
  if (eligible.length === 0) {
    return null;
  }

  const ranked = eligible
    .map((d) => ({ promotionId: d.id, discountAmount: computeDiscountAmount(price, (d.details as PromotionDetails) ?? {}) }))
    .sort((a, b) => b.discountAmount - a.discountAmount);

  return ranked[0];
}

/** For inclusion in booking.service.ts's createBooking $transaction array — not awaited directly. */
export function buildRedemptionIncrementQuery(promotionId: string) {
  return prisma.promotion.update({ where: { id: promotionId }, data: { timesRedeemed: { increment: 1 } } });
}
