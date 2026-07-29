import { Request, Response } from "express";
import * as providerService from "./provider.service";
import * as listingService from "../listing/listing.service";
import * as availabilityService from "../availability/availability.service";
import * as bookingService from "../booking/booking.service";
import * as paymentService from "../payment/payment.service";
import * as extraChargeService from "../extraCharge/extraCharge.service";
import * as rescheduleService from "../reschedule/reschedule.service";
import * as disputeService from "../dispute/dispute.service";
import * as messageService from "../message/message.service";
import * as notificationService from "../notification/notification.service";
import * as reviewService from "../review/review.service";
import * as documentationService from "../documentation/documentation.service";
import { createCertificationSchema, submitKycDocumentSchema, updateProviderProfileSchema } from "./provider.schemas";
import {
  analyzeImageSchema,
  createListingSchema,
  recommendCategoryFromImageSchema,
  recommendCategorySchema,
  updateListingSchema,
} from "../listing/listing.schemas";
import { createSlotSchema, updateSlotSchema } from "../availability/availability.schemas";
import { cancelBookingSchema } from "../booking/booking.schemas";
import { payBillSchema, withdrawSchema } from "../payment/payment.schemas";
import { createExtraChargeSchema } from "../extraCharge/extraCharge.schemas";
import { proposeRescheduleSchema, respondRescheduleSchema } from "../reschedule/reschedule.schemas";
import { openDisputeSchema } from "../dispute/dispute.schemas";
import { sendMessageSchema } from "../message/message.schemas";
import { listNotificationsQuerySchema } from "../notification/notification.schemas";
import { replyToReviewSchema } from "../review/review.schemas";
import { submitProviderDocumentationSchema } from "../documentation/documentation.schemas";

export async function getProfileHandler(req: Request, res: Response) {
  const profile = await providerService.getMyProfile(req.user!.sub);
  res.status(200).json(profile);
}

export async function updateProfileHandler(req: Request, res: Response) {
  const input = updateProviderProfileSchema.parse(req.body);
  const profile = await providerService.updateMyProfile(req.user!.sub, input);
  res.status(200).json(profile);
}

export async function listCertificationsHandler(req: Request, res: Response) {
  const certs = await providerService.listCertifications(req.user!.sub);
  res.status(200).json(certs);
}

export async function createCertificationHandler(req: Request, res: Response) {
  const input = createCertificationSchema.parse(req.body);
  const cert = await providerService.createCertification(req.user!.sub, input);
  res.status(201).json(cert);
}

export async function deleteCertificationHandler(req: Request, res: Response) {
  await providerService.deleteCertification(req.user!.sub, req.params.certificationId);
  res.status(204).send();
}

export async function listKycDocumentsHandler(req: Request, res: Response) {
  const docs = await providerService.listKycDocuments(req.user!.sub);
  res.status(200).json(docs);
}

export async function submitKycDocumentHandler(req: Request, res: Response) {
  const input = submitKycDocumentSchema.parse(req.body);
  const doc = await providerService.submitKycDocument(req.user!.sub, input);
  res.status(201).json(doc);
}

export async function getKycDocumentUrlHandler(req: Request, res: Response) {
  const result = await providerService.getKycDocumentUrl(req.user!.sub, req.params.kycId);
  res.status(200).json(result);
}

export async function listMyListingsHandler(req: Request, res: Response) {
  const listings = await listingService.listMyListings(req.user!.sub);
  res.status(200).json(listings);
}

export async function getMyListingHandler(req: Request, res: Response) {
  const listing = await listingService.getMyListing(req.user!.sub, req.params.listingId);
  res.status(200).json(listing);
}

export async function createMyListingHandler(req: Request, res: Response) {
  const input = createListingSchema.parse(req.body);
  const listing = await listingService.createListing(req.user!.sub, input);
  res.status(201).json(listing);
}

export async function updateMyListingHandler(req: Request, res: Response) {
  const input = updateListingSchema.parse(req.body);
  const listing = await listingService.updateListing(req.user!.sub, req.params.listingId, input);
  res.status(200).json(listing);
}

export async function deleteMyListingHandler(req: Request, res: Response) {
  await listingService.deleteListing(req.user!.sub, req.params.listingId);
  res.status(204).send();
}

export async function recommendCategoryHandler(req: Request, res: Response) {
  const input = recommendCategorySchema.parse(req.body);
  const recommendation = await listingService.recommendCategory(input);
  res.status(200).json(recommendation);
}

export async function getListingCompletenessHandler(req: Request, res: Response) {
  const result = await listingService.getListingCompleteness(req.user!.sub, req.params.listingId);
  res.status(200).json(result);
}

export async function improveListingDescriptionHandler(req: Request, res: Response) {
  const result = await listingService.improveListingDescription(req.user!.sub, req.params.listingId);
  res.status(200).json(result);
}

export async function suggestListingKeywordsHandler(req: Request, res: Response) {
  const result = await listingService.suggestListingKeywords(req.user!.sub, req.params.listingId);
  res.status(200).json(result);
}

export async function recommendCategoryFromImageHandler(req: Request, res: Response) {
  const input = recommendCategoryFromImageSchema.parse(req.body);
  const recommendation = await listingService.recommendCategoryFromImage(input);
  res.status(200).json(recommendation);
}

export async function analyzeListingImageHandler(req: Request, res: Response) {
  const input = analyzeImageSchema.parse(req.body);
  const result = await listingService.analyzeListingImage(input);
  res.status(200).json(result);
}

export async function listMyAvailabilityHandler(req: Request, res: Response) {
  const slots = await availabilityService.listMySlots(req.user!.sub);
  res.status(200).json(slots);
}

export async function createMyAvailabilitySlotHandler(req: Request, res: Response) {
  const input = createSlotSchema.parse(req.body);
  const slot = await availabilityService.createSlot(req.user!.sub, input);
  res.status(201).json(slot);
}

export async function updateMyAvailabilitySlotHandler(req: Request, res: Response) {
  const input = updateSlotSchema.parse(req.body);
  const slot = await availabilityService.updateSlot(req.user!.sub, req.params.slotId, input);
  res.status(200).json(slot);
}

export async function deleteMyAvailabilitySlotHandler(req: Request, res: Response) {
  await availabilityService.deleteSlot(req.user!.sub, req.params.slotId);
  res.status(204).send();
}

export async function listMyBookingsHandler(req: Request, res: Response) {
  const bookings = await bookingService.listProviderBookings(req.user!.sub);
  res.status(200).json(bookings);
}

export async function getMyBookingHandler(req: Request, res: Response) {
  const booking = await bookingService.getProviderBooking(req.user!.sub, req.params.bookingId);
  res.status(200).json(booking);
}

export async function acceptBookingHandler(req: Request, res: Response) {
  const booking = await bookingService.acceptBooking(req.user!.sub, req.params.bookingId);
  res.status(200).json(booking);
}

export async function declineBookingHandler(req: Request, res: Response) {
  const booking = await bookingService.declineBooking(req.user!.sub, req.params.bookingId);
  res.status(200).json(booking);
}

export async function startBookingHandler(req: Request, res: Response) {
  const booking = await bookingService.startBooking(req.user!.sub, req.params.bookingId);
  res.status(200).json(booking);
}

export async function completeBookingHandler(req: Request, res: Response) {
  const booking = await bookingService.completeBooking(req.user!.sub, req.params.bookingId);
  res.status(200).json(booking);
}

export async function cancelMyBookingHandler(req: Request, res: Response) {
  const input = cancelBookingSchema.parse(req.body);
  const booking = await bookingService.cancelBookingAsProvider(req.user!.sub, req.params.bookingId, input);
  res.status(200).json(booking);
}

export async function markCustomerNoShowHandler(req: Request, res: Response) {
  const booking = await bookingService.markCustomerNoShow(req.user!.sub, req.params.bookingId);
  res.status(200).json(booking);
}

export async function proposeRescheduleHandler(req: Request, res: Response) {
  const input = proposeRescheduleSchema.parse(req.body);
  const request = await rescheduleService.proposeRescheduleAsProvider(req.user!.sub, req.params.bookingId, input);
  res.status(201).json(request);
}

export async function respondRescheduleHandler(req: Request, res: Response) {
  const input = respondRescheduleSchema.parse(req.body);
  const request = await rescheduleService.respondToRescheduleAsProvider(
    req.user!.sub,
    req.params.bookingId,
    req.params.requestId,
    input,
  );
  res.status(200).json(request);
}

export async function openDisputeHandler(req: Request, res: Response) {
  const input = openDisputeSchema.parse(req.body);
  const dispute = await disputeService.openDisputeAsProvider(req.user!.sub, req.params.bookingId, input);
  res.status(201).json(dispute);
}

export async function listMessagesHandler(req: Request, res: Response) {
  const messages = await messageService.listMessagesAsProvider(req.user!.sub, req.params.bookingId);
  res.status(200).json(messages);
}

export async function sendMessageHandler(req: Request, res: Response) {
  const input = sendMessageSchema.parse(req.body);
  const message = await messageService.sendMessageAsProvider(req.user!.sub, req.params.bookingId, input);
  res.status(201).json(message);
}

export async function listMyPaymentsHandler(req: Request, res: Response) {
  const payments = await paymentService.listProviderPayments(req.user!.sub);
  res.status(200).json(payments);
}

export async function requestExtraChargeHandler(req: Request, res: Response) {
  const input = createExtraChargeSchema.parse(req.body);
  const charge = await extraChargeService.requestExtraCharge(req.user!.sub, req.params.bookingId, input);
  res.status(201).json(charge);
}

export async function getMyBalanceHandler(req: Request, res: Response) {
  const balance = await paymentService.getProviderBalance(req.user!.sub);
  res.status(200).json(balance);
}

export async function withdrawBalanceHandler(req: Request, res: Response) {
  const input = withdrawSchema.parse(req.body);
  const withdrawal = await paymentService.withdrawBalance(req.user!.sub, input);
  res.status(201).json(withdrawal);
}

export async function listMyWithdrawalsHandler(req: Request, res: Response) {
  const withdrawals = await paymentService.listWithdrawals(req.user!.sub);
  res.status(200).json(withdrawals);
}

export async function listMyBillsHandler(req: Request, res: Response) {
  const bills = await paymentService.listProviderBills(req.user!.sub);
  res.status(200).json(bills);
}

export async function payMyBillHandler(req: Request, res: Response) {
  const input = payBillSchema.parse(req.body);
  const bill = await paymentService.payBill(req.user!.sub, req.params.billId, input);
  res.status(200).json(bill);
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

export async function listMyReviewsHandler(req: Request, res: Response) {
  const reviews = await reviewService.listReviewsForMyProvider(req.user!.sub);
  res.status(200).json(reviews);
}

export async function replyToReviewHandler(req: Request, res: Response) {
  const input = replyToReviewSchema.parse(req.body);
  const review = await reviewService.replyToReview(req.user!.sub, req.params.reviewId, input);
  res.status(200).json(review);
}

export async function submitProviderDocumentationHandler(req: Request, res: Response) {
  const input = submitProviderDocumentationSchema.parse(req.body);
  const doc = await documentationService.submitProviderDocumentation(req.user!.sub, req.params.bookingId, input);
  res.status(201).json(doc);
}

export async function listDocumentationHandler(req: Request, res: Response) {
  const docs = await documentationService.listDocumentationAsProvider(req.user!.sub, req.params.bookingId);
  res.status(200).json(docs);
}

export async function compareBeforeAfterHandler(req: Request, res: Response) {
  const result = await documentationService.compareBeforeAfterAsProvider(req.user!.sub, req.params.bookingId);
  res.status(200).json(result);
}
