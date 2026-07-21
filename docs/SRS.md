# EverySkill --- Universal Local Services Marketplace

## Project Overview

**EverySkill** is a web and mobile marketplace connecting customers with
local service providers. Providers may operate as **Individuals
(Freelancers)** or **Businesses**. Customers can search, book,
communicate, pay through escrow, and review providers.

## Technology Stack

  Layer            Technology
  ---------------- --------------------------------------------------
  Web Frontend     React + TypeScript
  Mobile           React Native (Expo)
  Backend          Node.js + Express + TypeScript
  Database         PostgreSQL (Supabase)
  ORM              Prisma
  Authentication   JWT + Refresh Tokens
  Realtime         Firebase Firestore or Socket.io
  Storage          Supabase Storage or Cloudinary
  Maps             Google Maps Platform
  AI               OpenAI API
  Payments         Multi-gateway (Stripe, PayPal, etc.) with Escrow

# Functional Requirements

## FR1 User Registration and Authentication

-   Register as Customer, Provider, Administrator, or Super
    Administrator.
-   Provider may be **Individual** or **Business**.
-   Secure login/logout/password recovery.
-   Social login (Google OAuth) as an alternative to email/password.
-   Email verification.
-   RBAC.
-   Manage account information.

## FR2 Customer Profile Management

Customers shall be able to: - Manage personal information. - Manage
addresses and preferred locations. - View booking history. - View
payment history. - Save and manage favorite providers. - Manage privacy
preferences. - Download personal data. - Request account deletion. -
View consent history.

## FR3 Provider Profile Management

Providers shall manage: - Business or Provider Name - Provider Type
(Individual / Business) - Profile Image - Cover Image - Business
Description - Skills and Expertise - Years of Experience - Contact
Information - Service Area - Website - Social Media Links - Portfolio
Links - Certifications and Licenses - Certificate Uploads - Certificate
Verification Links - Languages Spoken - Gallery of Previous Work -
Operating Hours - Verification Status

## FR4 Provider Verification (KYC)

-   Individuals upload identity documents.
-   Businesses upload registration documents and representative
    identity.
-   Administrators approve/reject requests.
-   Approved providers receive a verified badge.
-   Verification influences search ranking.

## FR5 GDPR Compliance

-   User consent.
-   Privacy preferences.
-   Download personal data.
-   Account deletion requests.
-   Consent history.

## FR6 Service Listing Management

Providers may create multiple service listings including: - Title -
Description - Category - Price - Duration - Images - Availability -
Service Area - Tags - Cancellation Policy

A listing's Cancellation Policy defines the cutoff (relative to the
booking time) after which a customer cancellation, or a no-show by
either party, is recorded against the responsible party's account (see
FR13).

## FR7 AI Service Category Recommendation

-   AI recommends the best category before publishing.

## FR8 Availability and Schedule Management

Providers shall: - Configure operating hours. - Configure appointment
slots. - Block unavailable dates. - Prevent double bookings.

## FR9 Search and Filtering

Search by: - Keyword - Category - Location - Budget - Availability -
Rating - Distance - Verification - Provider Type

## FR10 AI Intelligent Search

AI shall: - Understand natural language. - Extract service, budget,
location, preferred time, urgency. - Recommend providers using semantic
similarity, distance, ratings, reviews, response time, acceptance rate,
completed jobs, availability, customer preferences and verification. -
Explain recommendations.

## FR11 Booking Management

Booking workflow: - Requested - Accepted - In Progress - Completed -
Cancelled - Declined - Disputed

The system shall validate transitions, maintain history, and synchronize
with payment status.

## FR12 Escrow Payment System

Payment workflow: - Payment Pending - Payment Secured (Escrow) - Payment
Released - Refunded - Payment Failed

Features: - Multiple payment gateways. - Escrow holding. - Provider
payouts. - Refunds. - Disputes. - Transaction history.

## FR13 Cancellation and Dispute Resolution

-   Request cancellation.
-   Open disputes.
-   Admin resolution.
-   Record dispute history.
-   Cancellations made after the listing's cancellation cutoff (FR6),
    and no-shows, are logged against the responsible party (customer or
    provider) and factored into that party's standing on the platform.

## FR14 In-App Messaging

-   Booking-linked conversations.
-   Image attachments.

## FR15 Notifications

Notifications for: - Bookings - Messages - Payments - Reviews -
Verification - Promotions - Disputes

Channels: - In-app - Push - Email - SMS

## FR16 Ratings and Reviews

Customers can: - Rate completed services. - Write reviews. - Upload
review images.

Providers can: - Reply to reviews.

Platform displays: - Average rating - Rating distribution - Review
history

## FR17 Service Documentation

-   Customer before images.
-   Provider completion images.
-   Optional after images.
-   Linked to bookings.

## FR18 Reporting and Moderation

Users can report: - Poor quality - Fraud - Inappropriate behaviour -
Fake reviews - Offensive messages - Scam providers - Inappropriate
content

Reports support: - Description - Images - Supporting evidence

Admins: - Review - Warn - Suspend - Ban

## FR19 AI Content Assistance

-   Improve descriptions.
-   Suggest keywords.
-   Detect incomplete listings.

## FR20 AI Image Analysis

-   Category prediction.
-   Detect service objects.
-   Compare before/after.
-   Detect suspicious uploads.

## FR21 Customer Dashboard

-   Bookings
-   Payments
-   Favorites
-   Reviews
-   Messages
-   Profile

## FR22 Provider Dashboard

-   Profile
-   Services
-   Schedule
-   Bookings
-   Earnings
-   Analytics
-   Reviews
-   Manage certificates
-   Verification status

## FR23 Administrator Dashboard

-   Users
-   Verification
-   Reviews
-   Categories
-   Reports
-   Disputes
-   Analytics
-   Audit log of administrator actions (who changed what, and when)

## FR24 Super Administrator Dashboard

-   Administrators
-   Platform settings
-   Commissions
-   Escrow policies
-   Payment gateways
-   AI settings
-   GDPR
-   KYC
-   Countries
-   Currencies
-   Languages
-   Notifications
-   Security logs
-   Audit log of administrator and super administrator actions (who
    changed what, and when)
-   Backups
-   Platform-wide reports

## FR25 Reports and Analytics

Reports: - Users - Providers - Bookings - Revenue - Service popularity -
Customer satisfaction - Provider performance - Financial statistics -
Platform growth

## FR26 Promotions and Marketing

Providers can: - Discounts - Campaigns - Coupon codes

## FR27 Mobile Application

Supports customer/provider features, payments, messaging, notifications,
uploads and bookings.

## FR28 External API Integration

-   Google Maps
-   Payment gateways
-   Email
-   SMS
-   AI services

# Non-Functional Requirements

## NFR1 Security

-   Passwords are hashed (bcrypt/argon2) before storage.
-   JWT access tokens are short-lived; refresh tokens are used to
    re-issue them.
-   All traffic (web, mobile, API) is served over HTTPS.

## NFR2 Performance

-   The system should comfortably support a moderate number of
    concurrent users appropriate for a demo/portfolio-scale deployment
    (e.g., low hundreds of concurrent sessions), with search and
    booking actions responding within a few seconds.

## NFR3 Compatibility

-   The web frontend is responsive and usable on both desktop and
    mobile browsers.
-   The mobile app (React Native/Expo) targets both iOS and Android.

## NFR4 Availability

-   The platform should be available during normal usage/demo periods;
    no formal uptime SLA is required at this project stage.
