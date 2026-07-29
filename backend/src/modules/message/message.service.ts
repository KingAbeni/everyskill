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
