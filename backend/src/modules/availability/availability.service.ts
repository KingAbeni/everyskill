import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import { z } from "zod";
import { createSlotSchema, updateSlotSchema } from "./availability.schemas";

type CreateSlotInput = z.infer<typeof createSlotSchema>;
type UpdateSlotInput = z.infer<typeof updateSlotSchema>;

function normalizeDate(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

async function getProviderProfileOrThrow(userId: string) {
  const profile = await prisma.providerProfile.findUnique({ where: { userId } });
  if (!profile) {
    throw new AppError(404, "Provider profile not found");
  }
  return profile;
}

/**
 * Search-level "is this provider available on this date" check — used to filter listings
 * (FR9). Only a *full-day* block ("00:00"-"23:59", the convention used for holidays/days off)
 * excludes a provider; partial blocks (e.g. a lunch break) don't, since the provider is still
 * open part of the day. Precise time-slot conflict checking against a specific requested time
 * happens at booking time instead (FR11), not here.
 */
export async function listAvailableProviderIds(date: Date): Promise<string[]> {
  const normalized = normalizeDate(date);
  const dayOfWeek = normalized.getUTCDay();

  const [fullDayBlocks, openForDate, openRecurring] = await Promise.all([
    prisma.availabilitySlot.findMany({
      where: { date: normalized, isBlocked: true, startTime: "00:00", endTime: "23:59" },
      select: { providerProfileId: true },
    }),
    prisma.availabilitySlot.findMany({
      where: { date: normalized, isBlocked: false },
      select: { providerProfileId: true },
    }),
    prisma.availabilitySlot.findMany({
      where: { dayOfWeek, isBlocked: false },
      select: { providerProfileId: true },
    }),
  ]);

  const blocked = new Set(fullDayBlocks.map((s) => s.providerProfileId));
  const open = new Set([...openForDate, ...openRecurring].map((s) => s.providerProfileId));

  return [...open].filter((id) => !blocked.has(id));
}

async function getOwnedSlotOrThrow(userId: string, slotId: string) {
  const profile = await getProviderProfileOrThrow(userId);
  const slot = await prisma.availabilitySlot.findUnique({ where: { id: slotId } });
  if (!slot || slot.providerProfileId !== profile.id) {
    throw new AppError(404, "Availability slot not found");
  }
  return { profile, slot };
}

interface OverlapCandidate {
  dayOfWeek: number | null;
  date: Date | null;
  startTime: string;
  endTime: string;
  isBlocked: boolean;
}

async function assertNoOverlap(providerProfileId: string, candidate: OverlapCandidate, excludeId?: string) {
  // Blocked windows are intentional carve-outs (e.g. a lunch break inside an available day) —
  // only two AVAILABLE windows overlapping for the same recurrence key is a real conflict.
  if (candidate.isBlocked) {
    return;
  }

  const siblings = await prisma.availabilitySlot.findMany({
    where: {
      providerProfileId,
      isBlocked: false,
      id: excludeId ? { not: excludeId } : undefined,
      ...(candidate.dayOfWeek !== null ? { dayOfWeek: candidate.dayOfWeek } : { date: candidate.date! }),
    },
  });

  const overlaps = siblings.some((s) => candidate.startTime < s.endTime && s.startTime < candidate.endTime);
  if (overlaps) {
    throw new AppError(409, "This availability window overlaps with an existing available slot");
  }
}

export async function listMySlots(userId: string) {
  const profile = await getProviderProfileOrThrow(userId);
  return prisma.availabilitySlot.findMany({
    where: { providerProfileId: profile.id },
    orderBy: [{ dayOfWeek: "asc" }, { date: "asc" }, { startTime: "asc" }],
  });
}

export async function listProviderAvailability(providerProfileId: string) {
  const profile = await prisma.providerProfile.findUnique({ where: { id: providerProfileId } });
  if (!profile) {
    throw new AppError(404, "Provider not found");
  }
  return prisma.availabilitySlot.findMany({
    where: { providerProfileId },
    orderBy: [{ dayOfWeek: "asc" }, { date: "asc" }, { startTime: "asc" }],
  });
}

export async function createSlot(userId: string, input: CreateSlotInput) {
  const profile = await getProviderProfileOrThrow(userId);
  const dayOfWeek = input.dayOfWeek ?? null;
  const date = input.date ? normalizeDate(input.date) : null;

  await assertNoOverlap(profile.id, {
    dayOfWeek,
    date,
    startTime: input.startTime,
    endTime: input.endTime,
    isBlocked: input.isBlocked,
  });

  return prisma.availabilitySlot.create({
    data: {
      providerProfileId: profile.id,
      dayOfWeek,
      date,
      startTime: input.startTime,
      endTime: input.endTime,
      isBlocked: input.isBlocked,
    },
  });
}

export async function updateSlot(userId: string, slotId: string, input: UpdateSlotInput) {
  const { profile, slot } = await getOwnedSlotOrThrow(userId, slotId);

  const merged = {
    dayOfWeek: input.dayOfWeek !== undefined ? input.dayOfWeek : slot.dayOfWeek,
    date: input.date !== undefined ? (input.date ? normalizeDate(input.date) : null) : slot.date,
    startTime: input.startTime ?? slot.startTime,
    endTime: input.endTime ?? slot.endTime,
    isBlocked: input.isBlocked ?? slot.isBlocked,
  };

  if ((merged.dayOfWeek !== null) === (merged.date !== null)) {
    throw new AppError(400, "A slot must have exactly one of dayOfWeek (recurring) or date (specific), not both or neither");
  }
  if (merged.startTime >= merged.endTime) {
    throw new AppError(400, "endTime must be after startTime");
  }

  await assertNoOverlap(profile.id, merged, slotId);

  return prisma.availabilitySlot.update({
    where: { id: slotId },
    data: merged,
  });
}

export async function deleteSlot(userId: string, slotId: string) {
  await getOwnedSlotOrThrow(userId, slotId);
  await prisma.availabilitySlot.delete({ where: { id: slotId } });
}
