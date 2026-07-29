import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth, requireRole } from "../../middleware/auth";
import * as providerController from "./provider.controller";

export const providerRouter = Router();

providerRouter.use(requireAuth, requireRole("PROVIDER"));

providerRouter.get("/me", asyncHandler(providerController.getProfileHandler));
providerRouter.get("/me/dashboard", asyncHandler(providerController.getDashboardHandler));
providerRouter.patch("/me", asyncHandler(providerController.updateProfileHandler));

providerRouter.get("/me/certifications", asyncHandler(providerController.listCertificationsHandler));
providerRouter.post("/me/certifications", asyncHandler(providerController.createCertificationHandler));
providerRouter.delete("/me/certifications/:certificationId", asyncHandler(providerController.deleteCertificationHandler));

providerRouter.get("/me/kyc", asyncHandler(providerController.listKycDocumentsHandler));
providerRouter.post("/me/kyc", asyncHandler(providerController.submitKycDocumentHandler));
providerRouter.get("/me/kyc/:kycId/document-url", asyncHandler(providerController.getKycDocumentUrlHandler));

providerRouter.get("/me/listings", asyncHandler(providerController.listMyListingsHandler));
providerRouter.post("/me/listings/recommend-category", asyncHandler(providerController.recommendCategoryHandler));
providerRouter.post("/me/listings/recommend-category-from-image", asyncHandler(providerController.recommendCategoryFromImageHandler));
providerRouter.post("/me/listings/analyze-image", asyncHandler(providerController.analyzeListingImageHandler));
providerRouter.post("/me/listings", asyncHandler(providerController.createMyListingHandler));
providerRouter.get("/me/listings/:listingId", asyncHandler(providerController.getMyListingHandler));
providerRouter.patch("/me/listings/:listingId", asyncHandler(providerController.updateMyListingHandler));
providerRouter.delete("/me/listings/:listingId", asyncHandler(providerController.deleteMyListingHandler));
providerRouter.get("/me/listings/:listingId/completeness", asyncHandler(providerController.getListingCompletenessHandler));
providerRouter.post("/me/listings/:listingId/improve-description", asyncHandler(providerController.improveListingDescriptionHandler));
providerRouter.post("/me/listings/:listingId/suggest-keywords", asyncHandler(providerController.suggestListingKeywordsHandler));

providerRouter.get("/me/availability", asyncHandler(providerController.listMyAvailabilityHandler));
providerRouter.post("/me/availability", asyncHandler(providerController.createMyAvailabilitySlotHandler));
providerRouter.patch("/me/availability/:slotId", asyncHandler(providerController.updateMyAvailabilitySlotHandler));
providerRouter.delete("/me/availability/:slotId", asyncHandler(providerController.deleteMyAvailabilitySlotHandler));

providerRouter.get("/me/bookings", asyncHandler(providerController.listMyBookingsHandler));
providerRouter.get("/me/bookings/:bookingId", asyncHandler(providerController.getMyBookingHandler));
providerRouter.patch("/me/bookings/:bookingId/accept", asyncHandler(providerController.acceptBookingHandler));
providerRouter.patch("/me/bookings/:bookingId/decline", asyncHandler(providerController.declineBookingHandler));
providerRouter.patch("/me/bookings/:bookingId/start", asyncHandler(providerController.startBookingHandler));
providerRouter.patch("/me/bookings/:bookingId/complete", asyncHandler(providerController.completeBookingHandler));
providerRouter.patch("/me/bookings/:bookingId/cancel", asyncHandler(providerController.cancelMyBookingHandler));
providerRouter.patch("/me/bookings/:bookingId/no-show", asyncHandler(providerController.markCustomerNoShowHandler));
providerRouter.post("/me/bookings/:bookingId/reschedule", asyncHandler(providerController.proposeRescheduleHandler));
providerRouter.patch(
  "/me/bookings/:bookingId/reschedule/:requestId/respond",
  asyncHandler(providerController.respondRescheduleHandler),
);
providerRouter.post("/me/bookings/:bookingId/dispute", asyncHandler(providerController.openDisputeHandler));
providerRouter.get("/me/bookings/:bookingId/messages", asyncHandler(providerController.listMessagesHandler));
providerRouter.post("/me/bookings/:bookingId/messages", asyncHandler(providerController.sendMessageHandler));
providerRouter.post("/me/bookings/:bookingId/extra-charges", asyncHandler(providerController.requestExtraChargeHandler));

providerRouter.get("/me/payments", asyncHandler(providerController.listMyPaymentsHandler));

providerRouter.get("/me/balance", asyncHandler(providerController.getMyBalanceHandler));
providerRouter.post("/me/balance/withdraw", asyncHandler(providerController.withdrawBalanceHandler));
providerRouter.get("/me/withdrawals", asyncHandler(providerController.listMyWithdrawalsHandler));

providerRouter.get("/me/bills", asyncHandler(providerController.listMyBillsHandler));
providerRouter.post("/me/bills/:billId/pay", asyncHandler(providerController.payMyBillHandler));

providerRouter.get("/me/notifications", asyncHandler(providerController.listNotificationsHandler));
providerRouter.get("/me/notifications/unread-count", asyncHandler(providerController.getNotificationsUnreadCountHandler));
providerRouter.patch("/me/notifications/read-all", asyncHandler(providerController.markAllNotificationsReadHandler));
providerRouter.patch("/me/notifications/:notificationId/read", asyncHandler(providerController.markNotificationReadHandler));

providerRouter.get("/me/reviews", asyncHandler(providerController.listMyReviewsHandler));
providerRouter.patch("/me/reviews/:reviewId/reply", asyncHandler(providerController.replyToReviewHandler));

providerRouter.get("/me/bookings/:bookingId/documentation", asyncHandler(providerController.listDocumentationHandler));
providerRouter.post("/me/bookings/:bookingId/documentation", asyncHandler(providerController.submitProviderDocumentationHandler));
providerRouter.post("/me/bookings/:bookingId/documentation/compare", asyncHandler(providerController.compareBeforeAfterHandler));
