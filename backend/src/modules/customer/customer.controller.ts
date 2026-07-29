import { Request, Response } from "express";
import * as customerService from "./customer.service";
import * as bookingService from "../booking/booking.service";
import * as paymentService from "../payment/payment.service";
import * as extraChargeService from "../extraCharge/extraCharge.service";
import * as rescheduleService from "../reschedule/reschedule.service";
import * as disputeService from "../dispute/dispute.service";
import * as messageService from "../message/message.service";
import * as notificationService from "../notification/notification.service";
import * as reviewService from "../review/review.service";
import * as documentationService from "../documentation/documentation.service";
import {
  addFavoriteSchema,
  createAddressSchema,
  recordConsentSchema,
  updateAddressSchema,
  updateProfileSchema,
} from "./customer.schemas";
import { cancelBookingSchema, createBookingSchema } from "../booking/booking.schemas";
import { payBookingSchema } from "../payment/payment.schemas";
import { payExtraChargeSchema, respondExtraChargeSchema } from "../extraCharge/extraCharge.schemas";
import { proposeRescheduleSchema, respondRescheduleSchema } from "../reschedule/reschedule.schemas";
import { openDisputeSchema } from "../dispute/dispute.schemas";
import { sendMessageSchema } from "../message/message.schemas";
import { listNotificationsQuerySchema } from "../notification/notification.schemas";
import { createReviewSchema } from "../review/review.schemas";
import { submitBeforeDocumentationSchema } from "../documentation/documentation.schemas";

export async function getProfileHandler(req: Request, res: Response) {
  const profile = await customerService.getMyProfile(req.user!.sub);
  res.status(200).json(profile);
}

export async function updateProfileHandler(req: Request, res: Response) {
  const input = updateProfileSchema.parse(req.body);
  const profile = await customerService.updateMyProfile(req.user!.sub, input);
  res.status(200).json(profile);
}

export async function listAddressesHandler(req: Request, res: Response) {
  const addresses = await customerService.listAddresses(req.user!.sub);
  res.status(200).json(addresses);
}

export async function createAddressHandler(req: Request, res: Response) {
  const input = createAddressSchema.parse(req.body);
  const address = await customerService.createAddress(req.user!.sub, input);
  res.status(201).json(address);
}

export async function updateAddressHandler(req: Request, res: Response) {
  const input = updateAddressSchema.parse(req.body);
  const address = await customerService.updateAddress(req.user!.sub, req.params.addressId, input);
  res.status(200).json(address);
}

export async function deleteAddressHandler(req: Request, res: Response) {
  await customerService.deleteAddress(req.user!.sub, req.params.addressId);
  res.status(204).send();
}

export async function listFavoritesHandler(req: Request, res: Response) {
  const favorites = await customerService.listFavorites(req.user!.sub);
  res.status(200).json(favorites);
}

export async function addFavoriteHandler(req: Request, res: Response) {
  const input = addFavoriteSchema.parse(req.body);
  const favorite = await customerService.addFavorite(req.user!.sub, input);
  res.status(201).json(favorite);
}

export async function removeFavoriteHandler(req: Request, res: Response) {
  await customerService.removeFavorite(req.user!.sub, req.params.providerProfileId);
  res.status(204).send();
}

export async function listBookingsHandler(req: Request, res: Response) {
  const bookings = await customerService.listBookings(req.user!.sub);
  res.status(200).json(bookings);
}

export async function createBookingHandler(req: Request, res: Response) {
  const input = createBookingSchema.parse(req.body);
  const booking = await bookingService.createBooking(req.user!.sub, input);
  res.status(201).json(booking);
}

export async function getBookingHandler(req: Request, res: Response) {
  const booking = await bookingService.getCustomerBooking(req.user!.sub, req.params.bookingId);
  res.status(200).json(booking);
}

export async function cancelBookingHandler(req: Request, res: Response) {
  const input = cancelBookingSchema.parse(req.body);
  const booking = await bookingService.cancelBookingAsCustomer(req.user!.sub, req.params.bookingId, input);
  res.status(200).json(booking);
}

export async function markProviderNoShowHandler(req: Request, res: Response) {
  const booking = await bookingService.markProviderNoShow(req.user!.sub, req.params.bookingId);
  res.status(200).json(booking);
}

export async function proposeRescheduleHandler(req: Request, res: Response) {
  const input = proposeRescheduleSchema.parse(req.body);
  const request = await rescheduleService.proposeRescheduleAsCustomer(req.user!.sub, req.params.bookingId, input);
  res.status(201).json(request);
}

export async function respondRescheduleHandler(req: Request, res: Response) {
  const input = respondRescheduleSchema.parse(req.body);
  const request = await rescheduleService.respondToRescheduleAsCustomer(
    req.user!.sub,
    req.params.bookingId,
    req.params.requestId,
    input,
  );
  res.status(200).json(request);
}

export async function openDisputeHandler(req: Request, res: Response) {
  const input = openDisputeSchema.parse(req.body);
  const dispute = await disputeService.openDisputeAsCustomer(req.user!.sub, req.params.bookingId, input);
  res.status(201).json(dispute);
}

export async function listMessagesHandler(req: Request, res: Response) {
  const messages = await messageService.listMessagesAsCustomer(req.user!.sub, req.params.bookingId);
  res.status(200).json(messages);
}

export async function sendMessageHandler(req: Request, res: Response) {
  const input = sendMessageSchema.parse(req.body);
  const message = await messageService.sendMessageAsCustomer(req.user!.sub, req.params.bookingId, input);
  res.status(201).json(message);
}

export async function listPaymentsHandler(req: Request, res: Response) {
  const payments = await customerService.listPayments(req.user!.sub);
  res.status(200).json(payments);
}

export async function payBookingHandler(req: Request, res: Response) {
  const input = payBookingSchema.parse(req.body);
  const payment = await paymentService.payForBooking(req.user!.sub, req.params.bookingId, input);
  res.status(201).json(payment);
}

export async function respondExtraChargeHandler(req: Request, res: Response) {
  const input = respondExtraChargeSchema.parse(req.body);
  const charge = await extraChargeService.respondToExtraCharge(
    req.user!.sub,
    req.params.bookingId,
    req.params.chargeId,
    input,
  );
  res.status(200).json(charge);
}

export async function payExtraChargeHandler(req: Request, res: Response) {
  const input = payExtraChargeSchema.parse(req.body);
  const result = await extraChargeService.payExtraCharge(req.user!.sub, req.params.bookingId, req.params.chargeId, input);
  res.status(201).json(result);
}

export async function listConsentsHandler(req: Request, res: Response) {
  const consents = await customerService.listConsents(req.user!.sub);
  res.status(200).json(consents);
}

export async function recordConsentHandler(req: Request, res: Response) {
  const input = recordConsentSchema.parse(req.body);
  const consent = await customerService.recordConsent(req.user!.sub, input);
  res.status(201).json(consent);
}

export async function exportDataHandler(req: Request, res: Response) {
  const data = await customerService.exportMyData(req.user!.sub);
  res.status(200).json(data);
}

export async function listNotificationsHandler(req: Request, res: Response) {
  const query = listNotificationsQuerySchema.parse(req.query);
  const notifications = await notificationService.listMyNotifications(req.user!.sub, query);
  res.status(200).json(notifications);
}

export async function getNotificationsUnreadCountHandler(req: Request, res: Response) {
  const result = await notificationService.getUnreadCount(req.user!.sub);
  res.status(200).json(result);
}

export async function markNotificationReadHandler(req: Request, res: Response) {
  const notification = await notificationService.markAsRead(req.user!.sub, req.params.notificationId);
  res.status(200).json(notification);
}

export async function markAllNotificationsReadHandler(req: Request, res: Response) {
  const result = await notificationService.markAllAsRead(req.user!.sub);
  res.status(200).json(result);
}

export async function createReviewHandler(req: Request, res: Response) {
  const input = createReviewSchema.parse(req.body);
  const review = await reviewService.createReview(req.user!.sub, req.params.bookingId, input);
  res.status(201).json(review);
}

export async function listMyReviewsHandler(req: Request, res: Response) {
  const reviews = await reviewService.listMyReviewsAsCustomer(req.user!.sub);
  res.status(200).json(reviews);
}

export async function submitBeforeDocumentationHandler(req: Request, res: Response) {
  const input = submitBeforeDocumentationSchema.parse(req.body);
  const doc = await documentationService.submitBeforeDocumentation(req.user!.sub, req.params.bookingId, input);
  res.status(201).json(doc);
}

export async function listDocumentationHandler(req: Request, res: Response) {
  const docs = await documentationService.listDocumentationAsCustomer(req.user!.sub, req.params.bookingId);
  res.status(200).json(docs);
}

export async function compareBeforeAfterHandler(req: Request, res: Response) {
  const result = await documentationService.compareBeforeAfterAsCustomer(req.user!.sub, req.params.bookingId);
  res.status(200).json(result);
}

export async function deleteAccountHandler(req: Request, res: Response) {
  await customerService.requestAccountDeletion(req.user!.sub);
  res.status(204).send();
}
