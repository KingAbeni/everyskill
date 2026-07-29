import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth, requireRole } from "../../middleware/auth";
import * as customerController from "./customer.controller";

export const customerRouter = Router();

customerRouter.use(requireAuth, requireRole("CUSTOMER"));

customerRouter.get("/me", asyncHandler(customerController.getProfileHandler));
customerRouter.get("/me/dashboard", asyncHandler(customerController.getDashboardHandler));
customerRouter.patch("/me", asyncHandler(customerController.updateProfileHandler));
customerRouter.delete("/me", asyncHandler(customerController.deleteAccountHandler));
customerRouter.get("/me/export", asyncHandler(customerController.exportDataHandler));

customerRouter.get("/me/addresses", asyncHandler(customerController.listAddressesHandler));
customerRouter.post("/me/addresses", asyncHandler(customerController.createAddressHandler));
customerRouter.patch("/me/addresses/:addressId", asyncHandler(customerController.updateAddressHandler));
customerRouter.delete("/me/addresses/:addressId", asyncHandler(customerController.deleteAddressHandler));

customerRouter.get("/me/favorites", asyncHandler(customerController.listFavoritesHandler));
customerRouter.post("/me/favorites", asyncHandler(customerController.addFavoriteHandler));
customerRouter.delete("/me/favorites/:providerProfileId", asyncHandler(customerController.removeFavoriteHandler));

customerRouter.get("/me/bookings", asyncHandler(customerController.listBookingsHandler));
customerRouter.post("/me/bookings", asyncHandler(customerController.createBookingHandler));
customerRouter.get("/me/bookings/:bookingId", asyncHandler(customerController.getBookingHandler));
customerRouter.patch("/me/bookings/:bookingId/cancel", asyncHandler(customerController.cancelBookingHandler));
customerRouter.patch("/me/bookings/:bookingId/no-show", asyncHandler(customerController.markProviderNoShowHandler));
customerRouter.post("/me/bookings/:bookingId/reschedule", asyncHandler(customerController.proposeRescheduleHandler));
customerRouter.patch(
  "/me/bookings/:bookingId/reschedule/:requestId/respond",
  asyncHandler(customerController.respondRescheduleHandler),
);
customerRouter.post("/me/bookings/:bookingId/dispute", asyncHandler(customerController.openDisputeHandler));
customerRouter.post("/me/bookings/:bookingId/review", asyncHandler(customerController.createReviewHandler));
customerRouter.get("/me/bookings/:bookingId/documentation", asyncHandler(customerController.listDocumentationHandler));
customerRouter.post("/me/bookings/:bookingId/documentation", asyncHandler(customerController.submitBeforeDocumentationHandler));
customerRouter.post("/me/bookings/:bookingId/documentation/compare", asyncHandler(customerController.compareBeforeAfterHandler));
customerRouter.get("/me/bookings/:bookingId/messages", asyncHandler(customerController.listMessagesHandler));
customerRouter.post("/me/bookings/:bookingId/messages", asyncHandler(customerController.sendMessageHandler));
customerRouter.post("/me/bookings/:bookingId/pay", asyncHandler(customerController.payBookingHandler));
customerRouter.patch(
  "/me/bookings/:bookingId/extra-charges/:chargeId/respond",
  asyncHandler(customerController.respondExtraChargeHandler),
);
customerRouter.post(
  "/me/bookings/:bookingId/extra-charges/:chargeId/pay",
  asyncHandler(customerController.payExtraChargeHandler),
);
customerRouter.get("/me/payments", asyncHandler(customerController.listPaymentsHandler));
customerRouter.get("/me/reviews", asyncHandler(customerController.listMyReviewsHandler));

customerRouter.get("/me/consents", asyncHandler(customerController.listConsentsHandler));
customerRouter.post("/me/consents", asyncHandler(customerController.recordConsentHandler));

customerRouter.get("/me/notifications", asyncHandler(customerController.listNotificationsHandler));
customerRouter.get("/me/notifications/unread-count", asyncHandler(customerController.getNotificationsUnreadCountHandler));
customerRouter.patch("/me/notifications/read-all", asyncHandler(customerController.markAllNotificationsReadHandler));
customerRouter.patch("/me/notifications/:notificationId/read", asyncHandler(customerController.markNotificationReadHandler));
