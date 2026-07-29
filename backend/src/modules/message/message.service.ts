import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import { z } from "zod";
import { sendMessageSchema } from "./message.schemas";
import { notify, NotificationType } from "../notification/notification.service";

type SendMessageInput = z.infer<typeof sendMessageSchema>;

const messageSenderSelect = { id: true, email: true, role: true } as const;

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

async function getConversationForCustomer(userId: string, bookingId: string) {
  const profile = await getCustomerProfileOrThrow(userId);
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { providerProfile: true } });
  if (!booking || booking.customerId !== profile.id) {
    throw new AppError(404, "Booking not found");
  }
  const conversation = await prisma.conversation.findUnique({ where: { bookingId } });
  if (!conversation) {
    throw new AppError(404, "Conversation not found");
  }
  return { conversation, recipientUserId: booking.providerProfile.userId };
}

async function getConversationForProvider(userId: string, bookingId: string) {
  const profile = await getProviderProfileOrThrow(userId);
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { customer: true } });
  if (!booking || booking.providerProfileId !== profile.id) {
    throw new AppError(404, "Booking not found");
  }
  const conversation = await prisma.conversation.findUnique({ where: { bookingId } });
  if (!conversation) {
    throw new AppError(404, "Conversation not found");
  }
  return { conversation, recipientUserId: booking.customer.userId };
}

export async function listMessagesAsCustomer(userId: string, bookingId: string) {
  const { conversation } = await getConversationForCustomer(userId, bookingId);
  return prisma.message.findMany({
    where: { conversationId: conversation.id },
    include: { sender: { select: messageSenderSelect } },
    orderBy: { createdAt: "asc" },
  });
}

export async function sendMessageAsCustomer(userId: string, bookingId: string, input: SendMessageInput) {
  const { conversation, recipientUserId } = await getConversationForCustomer(userId, bookingId);
  const message = await prisma.message.create({
    data: { conversationId: conversation.id, senderId: userId, content: input.content, imageUrl: input.imageUrl },
    include: { sender: { select: messageSenderSelect } },
  });
  await notify(recipientUserId, NotificationType.MESSAGE_RECEIVED, input.content?.slice(0, 140) ?? "Sent an image", bookingId);
  return message;
}

export async function listMessagesAsProvider(userId: string, bookingId: string) {
  const { conversation } = await getConversationForProvider(userId, bookingId);
  return prisma.message.findMany({
    where: { conversationId: conversation.id },
    include: { sender: { select: messageSenderSelect } },
    orderBy: { createdAt: "asc" },
  });
}

export async function sendMessageAsProvider(userId: string, bookingId: string, input: SendMessageInput) {
  const { conversation, recipientUserId } = await getConversationForProvider(userId, bookingId);
  const message = await prisma.message.create({
    data: { conversationId: conversation.id, senderId: userId, content: input.content, imageUrl: input.imageUrl },
    include: { sender: { select: messageSenderSelect } },
  });
  await notify(recipientUserId, NotificationType.MESSAGE_RECEIVED, input.content?.slice(0, 140) ?? "Sent an image", bookingId);
  return message;
}

/**
 * FR21/FR22 dashboards — one preview row per conversation the user participates in (via their
 * bookings), newest message first. There's no isRead tracking on Message (documented FR14
 * limitation), so this is "recent activity", not an unread inbox.
 */
async function listRecentMessagesForBookingFilter(bookingFilter: Record<string, unknown>, limit: number) {
  const latestPerConversation = await prisma.message.groupBy({
    by: ["conversationId"],
    where: { conversation: { booking: bookingFilter } },
    _max: { createdAt: true },
  });
  if (latestPerConversation.length === 0) {
    return [];
  }
  return prisma.message.findMany({
    where: {
      OR: latestPerConversation
        .filter((g) => g._max.createdAt !== null)
        .map((g) => ({ conversationId: g.conversationId, createdAt: g._max.createdAt! })),
    },
    include: {
      sender: { select: messageSenderSelect },
      conversation: { include: { booking: { include: { listing: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function listRecentMessagesForCustomer(userId: string, limit = 10) {
  const profile = await getCustomerProfileOrThrow(userId);
  return listRecentMessagesForBookingFilter({ customerId: profile.id }, limit);
}

export async function listRecentMessagesForProvider(userId: string, limit = 10) {
  const profile = await getProviderProfileOrThrow(userId);
  return listRecentMessagesForBookingFilter({ providerProfileId: profile.id }, limit);
}
