import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import { z } from "zod";
import { sendMessageSchema } from "./message.schemas";

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
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.customerId !== profile.id) {
    throw new AppError(404, "Booking not found");
  }
  const conversation = await prisma.conversation.findUnique({ where: { bookingId } });
  if (!conversation) {
    throw new AppError(404, "Conversation not found");
  }
  return conversation;
}

async function getConversationForProvider(userId: string, bookingId: string) {
  const profile = await getProviderProfileOrThrow(userId);
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.providerProfileId !== profile.id) {
    throw new AppError(404, "Booking not found");
  }
  const conversation = await prisma.conversation.findUnique({ where: { bookingId } });
  if (!conversation) {
    throw new AppError(404, "Conversation not found");
  }
  return conversation;
}

export async function listMessagesAsCustomer(userId: string, bookingId: string) {
  const conversation = await getConversationForCustomer(userId, bookingId);
  return prisma.message.findMany({
    where: { conversationId: conversation.id },
    include: { sender: { select: messageSenderSelect } },
    orderBy: { createdAt: "asc" },
  });
}

export async function sendMessageAsCustomer(userId: string, bookingId: string, input: SendMessageInput) {
  const conversation = await getConversationForCustomer(userId, bookingId);
  return prisma.message.create({
    data: { conversationId: conversation.id, senderId: userId, content: input.content, imageUrl: input.imageUrl },
    include: { sender: { select: messageSenderSelect } },
  });
}

export async function listMessagesAsProvider(userId: string, bookingId: string) {
  const conversation = await getConversationForProvider(userId, bookingId);
  return prisma.message.findMany({
    where: { conversationId: conversation.id },
    include: { sender: { select: messageSenderSelect } },
    orderBy: { createdAt: "asc" },
  });
}

export async function sendMessageAsProvider(userId: string, bookingId: string, input: SendMessageInput) {
  const conversation = await getConversationForProvider(userId, bookingId);
  return prisma.message.create({
    data: { conversationId: conversation.id, senderId: userId, content: input.content, imageUrl: input.imageUrl },
    include: { sender: { select: messageSenderSelect } },
  });
}
