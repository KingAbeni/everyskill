# EverySkill Backend — API Documentation

Base URL (dev): `http://localhost:4000`

This document is updated as modules are built. Currently implemented: **Auth (FR1)**, **Customer Profile Management (FR2)**, **Provider Profile Management (FR3)**, **Provider Verification / KYC (FR4)**, **Service Listing Management (FR6)**, **AI Category Recommendation (FR7)**, **Availability & Schedule Management (FR8)**, **Search & Filtering (FR9)**, **AI Intelligent Search (FR10)**, **Booking Management (FR11)**, **Escrow Payment System (FR12)** (extended with provider balances/withdrawals, platform commission, offline payments, and mid-job extra charges — beyond the original SRS wording, added per direct request), **Cancellation & Dispute Resolution (FR13)** (extended with a reschedule alternative to late cancellation, and a violation-count/auto-suspension "standing" mechanic — also beyond the original SRS wording, per direct request), **In-App Messaging (FR14)**, **Notifications (FR15)** (in-app channel only — see that section for scope), **Ratings & Reviews (FR16)** (extended with a provider-reply endpoint beyond the literal SRS wording, per direct request), **Service Documentation (FR17)** (the SRS's "optional" after-image was made mandatory per direct request, with a later per-listing `requiresDocumentation` opt-out for service types with nothing visual to document, e.g. delivery), **Reporting & Moderation (FR18)** (bidirectional reporting per direct request, plus an FR15 gap fix — admins can now read their own notifications), **AI Content Assistance (FR19)**, **AI Image Analysis (FR20)** (vision-based — category prediction from a photo, object detection, before/after comparison, and automatic suspicious-upload flagging into FR18, per direct request), **Customer Dashboard (FR21)**, **Provider Dashboard (FR22)**, **Administrator Dashboard (FR23)** (adds a users list, a platform-wide reviews list, an audit-log endpoint, and platform analytics — none of which existed before), **Administrator Management** and **Super Administrator Dashboard (FR24)** (a GDPR-activity aggregate, plus honest read-only status summaries for escrow/payment-gateway/AI/localization "settings" that aren't real configurable systems — Countries and Security logs deliberately omitted as having no underlying concept at all), **Reports & Analytics (FR25)** (nine distinct endpoints, mostly genuine time-series with configurable date range/granularity, per direct request), and a generic **file upload endpoint** backing all of the above.

---

## Health Check

**GET** `/health`

Response `200`:
```json
{ "status": "ok" }
```

---

## Auth Module — `/api/auth`

### Register

**POST** `/api/auth/register`

Customer body:
```json
{
  "email": "customer@example.com",
  "password": "SuperSecret123",
  "role": "CUSTOMER",
  "firstName": "Test",
  "lastName": "Intern"
}
```

Provider body (Individual):
```json
{
  "email": "provider@example.com",
  "password": "SuperSecret123",
  "role": "PROVIDER",
  "providerType": "INDIVIDUAL",
  "displayName": "Jane's Plumbing"
}
```

Provider body (Business):
```json
{
  "email": "business@example.com",
  "password": "SuperSecret123",
  "role": "PROVIDER",
  "providerType": "BUSINESS",
  "displayName": "Acme Home Services"
}
```

Field notes:
| Field | Required | Notes |
|---|---|---|
| `email` | yes | must be a valid email, unique |
| `password` | yes | min 8 characters |
| `role` | yes | `"CUSTOMER"` or `"PROVIDER"` |
| `firstName` / `lastName` | customer only | ignored for providers |
| `providerType` | provider only | `"INDIVIDUAL"` or `"BUSINESS"`, defaults to `"INDIVIDUAL"` |
| `displayName` | provider only | defaults to the email if omitted |

Response `201`:
```json
{
  "user": { "id": "uuid", "email": "...", "role": "CUSTOMER", "emailVerified": false },
  "accessToken": "<jwt>",
  "refreshToken": "<jwt>"
}
```

Errors:
| Status | Body | Cause |
|---|---|---|
| `400` | `{ "error": "Validation failed", "details": {...} }` | Failed zod schema (bad email, short password, invalid role, etc.) |
| `409` | `{ "error": "An account with this email already exists" }` | Email already registered |

Only a bare `ProviderProfile` (type + display name) is created on registration — the rest of FR3's provider fields (description, skills, service area, certifications, gallery, operating hours, etc.) are managed via the Provider Module below.

---

### Login

**POST** `/api/auth/login`

Body:
```json
{ "email": "provider@example.com", "password": "SuperSecret123" }
```

Response `200`: same shape as register (`user`, `accessToken`, `refreshToken`).

Errors:
| Status | Body | Cause |
|---|---|---|
| `400` | `{ "error": "Validation failed", ... }` | Missing/invalid email or password field |
| `401` | `{ "error": "Invalid email or password" }` | Wrong email or wrong password, **or** the account was deleted via `DELETE /api/customers/me` |

---

### Refresh

**POST** `/api/auth/refresh`

Body:
```json
{ "refreshToken": "<jwt from login/register/refresh>" }
```

Response `200`:
```json
{ "accessToken": "<new jwt>", "refreshToken": "<new jwt>" }
```

Errors:
| Status | Body | Cause |
|---|---|---|
| `400` | `{ "error": "Validation failed", ... }` | Missing `refreshToken` |
| `401` | `{ "error": "Invalid or expired refresh token" }` | Token malformed / wrong secret / past 7-day expiry |
| `401` | `{ "error": "Refresh token has been revoked" }` | Token doesn't match the stored hash (already rotated, or user logged out) |

Each successful refresh **rotates** the refresh token — the old one stops working immediately (the stored hash is replaced), so the client must persist the new `refreshToken` from the response.

---

### Logout

**POST** `/api/auth/logout`
Header: `Authorization: Bearer <accessToken>`
No body.

| Status | Body | When |
|---|---|---|
| `204` | *(empty)* | Success — stored refresh-token hash cleared, refresh token immediately invalidated |
| `401` | `{ "error": "Missing or invalid Authorization header" }` | No `Authorization` header, or not `Bearer <token>` format |
| `401` | `{ "error": "Invalid or expired access token" }` | Access token malformed, wrong secret, or past its 15-min expiry |
| `500` | `{ "error": "Internal server error" }` | Unexpected failure |

---

### Forgot Password

**POST** `/api/auth/forgot-password`

Body:
```json
{ "email": "provider@example.com" }
```

Response `200` (always, regardless of whether the email is registered — this avoids leaking which emails exist):
```json
{ "message": "If an account exists for this email, a password reset link has been sent." }
```

No email provider is wired up yet (FR28), so instead of sending an email, the server logs the reset token to the console:
```
Password reset requested for provider@example.com: token=<jwt>
```
Use that token as-is in the reset-password call below. The token expires in 1 hour by default and is single-use (see below).

---

### Reset Password

**POST** `/api/auth/reset-password`

Body:
```json
{ "token": "<jwt from forgot-password>", "newPassword": "NewSuperSecret456" }
```

Response `200`:
```json
{ "message": "Password has been reset. Please log in again." }
```

Errors:
| Status | Body | Cause |
|---|---|---|
| `400` | `{ "error": "Validation failed", ... }` | Missing token or `newPassword` under 8 characters |
| `400` | `{ "error": "Invalid or expired reset token" }` | Token malformed, wrong secret, past its 1h expiry, already used, or superseded by a newer reset request |

On success, the user's refresh token is also revoked, so **all existing sessions are logged out** and the user must log in again with the new password.

---

### Change Password

**POST** `/api/auth/change-password`
Header: `Authorization: Bearer <accessToken>` (any role — customer, provider, admin, super admin)

Body:
```json
{ "currentPassword": "OldPassword123", "newPassword": "NewPassword456" }
```

Response `200`:
```json
{ "message": "Password changed. Please log in again on other devices." }
```

Self-service password change for an already-logged-in user (as opposed to `forgot-password`/`reset-password`, which is for a user who's locked out). Requires knowing the current password.

Errors:
| Status | Body | Cause |
|---|---|---|
| `400` | `{ "error": "Validation failed", ... }` | Missing `currentPassword`, or `newPassword` under 8 characters |
| `400` | `{ "error": "This account has no password set" }` | Account was created via social login (Google OAuth, FR1) and has no password to verify against |
| `401` | `{ "error": "Current password is incorrect" }` | `currentPassword` doesn't match |
| `401` | `{ "error": "Missing or invalid Authorization header" }` / `{ "error": "Invalid or expired access token" }` | No/invalid/expired access token |

On success, the refresh token is also revoked (same as `reset-password`) — **other devices/sessions are logged out**, but the access token used for this request stays valid until its own 15-minute expiry.

---

## Customer Module — `/api/customers` (FR2)

All routes below require `Authorization: Bearer <accessToken>` for a **CUSTOMER** account. A `PROVIDER`/`ADMIN` token gets `403 { "error": "Insufficient permissions" }`.

### Profile

**GET** `/api/customers/me` → `200`
```json
{
  "id": "profile-uuid",
  "email": "customer@example.com",
  "firstName": "Test",
  "lastName": "Intern",
  "phone": null,
  "avatarUrl": null,
  "privacyPreferences": null,
  "lateCancellationCount": 0,
  "noShowCount": 0
}
```
`lateCancellationCount`/`noShowCount` are your FR13 "standing" — see **Cancellation & Dispute Resolution (FR13)** further down.

### Dashboard (FR21)

**GET** `/api/customers/me/dashboard` → `200` — a single aggregation over data that each already has its own dedicated endpoint:
```json
{
  "profile": { "...": "same shape as GET /api/customers/me" },
  "bookings": {
    "recent": ["...5 most recent bookings, same shape as GET /me/bookings"],
    "countsByStatus": { "COMPLETED": 8, "REQUESTED": 1 }
  },
  "payments": { "recent": ["...5 most recent payments"] },
  "favorites": ["...all favorited providers"],
  "reviews": ["...all reviews you've written"],
  "recentMessages": ["...up to 10 rows, one per booking conversation, newest first"],
  "unreadNotificationCount": 3
}
```
`bookings.recent`/`payments.recent` are capped to the 5 most recent (a dashboard glance, not a data dump); `favorites`/`reviews` are returned in full since they're typically short lists already. `recentMessages` is a new aggregation — there's no unified inbox elsewhere in this app, so this is the single most recent message from each booking conversation the customer participates in, newest first. Since `Message` has no read/unread tracking (a documented FR14 limitation), this is "recent activity," not an unread count. `unreadNotificationCount` reuses FR15's existing count.

**PATCH** `/api/customers/me` — any subset of:
```json
{
  "firstName": "Test",
  "lastName": "Intern",
  "phone": "+1234567890",
  "avatarUrl": "https://example.com/avatar.png",
  "privacyPreferences": { "shareLocation": false }
}
```
Response `200`: the updated `CustomerProfile` row.

### Addresses

**GET** `/api/customers/me/addresses` → `200` — array of addresses.

**POST** `/api/customers/me/addresses`:
```json
{
  "label": "Home",
  "line1": "221B Baker Street",
  "line2": "",
  "city": "London",
  "state": "",
  "country": "UK",
  "postalCode": "NW1 6XE",
  "latitude": 51.5237,
  "longitude": -0.1585,
  "isDefault": true
}
```
`line1`, `city`, `country` required; everything else optional. Response `201`. Setting `isDefault: true` unsets it on any other address for that customer.

**PATCH** `/api/customers/me/addresses/:addressId` — same fields, all optional. Response `200`.

**DELETE** `/api/customers/me/addresses/:addressId` → `204`.

Errors for all three: `404 { "error": "Address not found" }` if the address doesn't exist or isn't yours.

### Favorites

**GET** `/api/customers/me/favorites` → `200` — array of `FavoriteProvider` rows, each including the full `providerProfile`.

**POST** `/api/customers/me/favorites`:
```json
{ "providerProfileId": "provider-profile-uuid" }
```
Response `201`. Idempotent — favoriting the same provider twice just returns the existing row. Errors: `404 { "error": "Provider not found" }` if the id doesn't exist.

**DELETE** `/api/customers/me/favorites/:providerProfileId` → `204` (no-op if it wasn't favorited).

### Booking & payment history

**GET** `/api/customers/me/bookings` → `200` — array of bookings (with `listing`, `providerProfile`, `payment` included), newest first. See **Booking Management (FR11)** below for creating/managing bookings, and **Escrow Payment System (FR12)** for paying a booking.

**GET** `/api/customers/me/payments` → `200` — array of payments across all your bookings, newest first.

### Consent history (FR5/GDPR)

**GET** `/api/customers/me/consents` → `200` — array of `{ id, consentType, granted, createdAt }`, newest first.

**POST** `/api/customers/me/consents`:
```json
{ "consentType": "marketing_emails", "granted": false }
```
Response `201` — appends a new consent record (history is never overwritten, so you can see every past decision for a given `consentType`).

### Data export (GDPR)

**GET** `/api/customers/me/export` → `200` — a single JSON object with everything tied to your account: `account`, `profile`, `addresses`, `favoriteProviders`, `consentHistory`, `bookings`, `payments`, `reviews`.

### Account deletion (GDPR)

**DELETE** `/api/customers/me` → `204`. This is a **soft delete**:
- All addresses and favorites are permanently deleted.
- The profile's name/phone/avatar are anonymized (`"Deleted" "User"`, nulls).
- The account's email is replaced with `deleted-<userId>@deleted.everyskill.local`, freeing the original email for reuse.
- The password and refresh token are cleared — the account can never log in again.
- `consentHistory` is preserved (it's the audit trail, not PII).

There's no "undo" endpoint — treat this as final even though the underlying row isn't physically dropped.

---

## Provider Module — `/api/providers` (FR3)

All routes below require `Authorization: Bearer <accessToken>` for a **PROVIDER** account. A `CUSTOMER`/`ADMIN` token gets `403 { "error": "Insufficient permissions" }`; no token gets `401 { "error": "Missing or invalid Authorization header" }`.

### Profile

**GET** `/api/providers/me` → `200`
```json
{
  "id": "profile-uuid",
  "userId": "user-uuid",
  "providerType": "INDIVIDUAL",
  "displayName": "Jane's Plumbing",
  "firstName": null,
  "lastName": null,
  "profileImage": null,
  "coverImage": null,
  "description": null,
  "skills": [],
  "yearsExperience": null,
  "contactInfo": null,
  "serviceArea": null,
  "latitude": null,
  "longitude": null,
  "website": null,
  "directorFirstName": null,
  "directorLastName": null,
  "directorContactInfo": null,
  "socialLinks": null,
  "portfolioLinks": null,
  "languages": [],
  "galleryImages": [],
  "operatingHours": null,
  "verificationStatus": "PENDING",
  "lateCancellationCount": 0,
  "noShowCount": 0,
  "createdAt": "...",
  "updatedAt": "...",
  "email": "provider@example.com"
}
```
`verificationStatus` is read-only here — it's set by admins via KYC review (FR4), not by the provider. `lateCancellationCount`/`noShowCount` are your FR13 "standing" — see **Cancellation & Dispute Resolution (FR13)** further down.

**PATCH** `/api/providers/me` — any subset of:
```json
{
  "displayName": "Jane's Plumbing",
  "firstName": "Jane",
  "lastName": "Doe",
  "profileImage": "https://example.com/profile.jpg",
  "coverImage": "https://example.com/cover.jpg",
  "description": "10 years fixing pipes across London",
  "skills": ["Plumbing", "Leak Repair", "Pipe Fitting"],
  "yearsExperience": 10,
  "contactInfo": "jane@platform.example",
  "serviceArea": "Greater London",
  "latitude": 51.5074,
  "longitude": -0.1278,
  "website": "https://janesplumbing.example.com",
  "directorFirstName": "John",
  "directorLastName": "Smith",
  "directorContactInfo": "john.smith@acme.example",
  "socialLinks": { "instagram": "https://instagram.com/janesplumbing" },
  "portfolioLinks": { "behance": "https://behance.net/janesplumbing" },
  "languages": ["en", "fr"],
  "galleryImages": ["https://example.com/gallery1.jpg", "https://example.com/gallery2.jpg"],
  "operatingHours": { "monday": { "open": "09:00", "close": "17:00" } }
}
```
`profileImage`, `coverImage`, `website`, and each entry in `galleryImages` must be valid URLs. `socialLinks`, `portfolioLinks`, and `operatingHours` accept any JSON object shape. `latitude`/`longitude` (decimal degrees) are used for distance-based search (FR9) — set them here to make this provider findable by `GET /api/listings?latitude=...&longitude=...&radiusKm=...`. Response `200`: the updated `ProviderProfile` row.

`firstName`/`lastName` are the provider's own personal name (relevant for `INDIVIDUAL` providers). `directorFirstName`/`directorLastName`/`directorContactInfo` are the business's director/representative name and contact (relevant for `BUSINESS` providers — this is the same "representative identity" the SRS mentions under provider KYC, FR4). None of these are required or restricted by `providerType` at the API level — any provider can set any of them.

### Dashboard (FR22)

**GET** `/api/providers/me/dashboard` → `200` — one aggregation over the SRS's eight bullets (Profile, Services, Schedule, Bookings, Earnings, Analytics, Reviews, Manage certificates, Verification status), each of which already has its own dedicated endpoint except Analytics:
```json
{
  "profile": { "...": "same shape as GET /api/providers/me" },
  "services": ["...all your listings, same as GET /me/listings"],
  "schedule": ["...all your availability slots, same as GET /me/availability"],
  "bookings": {
    "recent": ["...5 most recent bookings"],
    "countsByStatus": { "COMPLETED": 12, "REQUESTED": 2 }
  },
  "earnings": {
    "balance": { "...": "same as GET /me/balance" },
    "recentPayments": ["...5 most recent"],
    "recentWithdrawals": ["...5 most recent"],
    "pendingBillsCount": 0
  },
  "analytics": {
    "totalBookings": 14,
    "completedBookings": 12,
    "cancelledBookings": 1,
    "averageRating": 4.5,
    "reviewCount": 8
  },
  "reviews": ["...all reviews about you, same as GET /me/reviews"],
  "certifications": ["...all, same as GET /me/certifications"],
  "verification": { "status": "VERIFIED", "kycDocuments": ["...all, same as GET /me/kyc"] },
  "recentMessages": ["...up to 10 rows, one per booking conversation, newest first"],
  "unreadNotificationCount": 3
}
```
`bookings.recent`/`earnings.recentPayments`/`earnings.recentWithdrawals` are capped to the 5 most recent (a dashboard glance, not a data dump — same choice made for FR21); `services`/`schedule`/`reviews`/`certifications`/`kycDocuments` are returned in full since they're typically short lists. `analytics` is deliberately simple derived counts, not FR25's territory — `averageRating`/`reviewCount` reuse the exact same aggregate FR16 computes for listing search (`getProviderRatingSummaries`), so there's no risk of the two ever disagreeing. `recentMessages` reuses the same cross-booking "recent activity" preview introduced for FR21 (no read/unread tracking — see FR21/FR14 for why).

### Certifications

**GET** `/api/providers/me/certifications` → `200` — array of certifications, newest first.

**POST** `/api/providers/me/certifications`:
```json
{
  "name": "Certified Master Plumber",
  "issuer": "UK Plumbing Board",
  "fileUrl": "https://example.com/cert.pdf",
  "verificationLink": "https://example.com/verify/123",
  "expiryDate": "2027-01-01T00:00:00.000Z"
}
```
`name` and `fileUrl` required; `issuer`, `verificationLink`, `expiryDate` optional. Response `201`.

**DELETE** `/api/providers/me/certifications/:certificationId` → `204`. Errors: `404 { "error": "Certification not found" }` if it doesn't exist or isn't yours.

### KYC Documents (FR4)

KYC documents are stored **privately** (unlike profile/gallery images) — see the [Upload Module](#upload-module--apiuploads) below for how to actually upload the file first.

**GET** `/api/providers/me/kyc` → `200` — array of your own KYC submissions, newest first.

**POST** `/api/providers/me/kyc`:
```json
{
  "documentType": "IDENTITY",
  "documentPath": "031e5c1e-.../8e3cf92c-....jpg"
}
```
`documentType` is one of `"IDENTITY"` (individuals), `"BUSINESS_REGISTRATION"` or `"REPRESENTATIVE_IDENTITY"` (businesses — registration document and the director's ID, respectively). `documentPath` is the `path` returned by `POST /api/uploads/kyc` — **not** a URL. Response `201`, with `status: "PENDING"` until an admin reviews it.

**GET** `/api/providers/me/kyc/:kycId/document-url` → `200`:
```json
{ "url": "https://<project>.supabase.co/storage/v1/object/sign/everyskill-kyc-private/...", "expiresInSeconds": 600 }
```
A short-lived (10 min) signed URL to view your own uploaded document. Errors: `404 { "error": "KYC document not found" }` if the id doesn't exist or isn't yours.

---

## Admin Module — `/api/admin` (FR4, FR24)

All routes below require `Authorization: Bearer <accessToken>` for an **ADMIN** or **SUPER_ADMIN** account. Any other role gets `403 { "error": "Insufficient permissions" }`. The Administrator-management routes further below are **SUPER_ADMIN only** — an `ADMIN` token gets the same `403`.

There is still no public self-registration for admin accounts (by design — it would be a privilege-escalation hole). Instead:
- The **first** `SUPER_ADMIN` is created by running `npm run seed` once, with `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` set in `backend/.env` (see `.env.example`). Safe to re-run — it's a no-op if that email already has an account.
- Every `ADMIN` (and any additional `SUPER_ADMIN`) after that is created via `POST /api/admin/admins` below, by an existing `SUPER_ADMIN`.

### List KYC Requests

**GET** `/api/admin/kyc` → `200` — array of all KYC submissions across all providers (each includes the full `providerProfile`), oldest first.

**GET** `/api/admin/kyc?status=PENDING` — filter by `PENDING`, `VERIFIED`, or `REJECTED`.

### Review a KYC Request

**PATCH** `/api/admin/kyc/:kycId`

Approve:
```json
{ "status": "VERIFIED" }
```

Reject:
```json
{ "status": "REJECTED", "rejectionReason": "Document image is too blurry to verify" }
```
`rejectionReason` is required when `status` is `"REJECTED"` (`400` if omitted).

Response `200`: the updated `KycVerification` row. This single action also:
- Sets the provider's `ProviderProfile.verificationStatus` to the same `VERIFIED`/`REJECTED` value (this is the "verified badge" from the SRS) — approving/rejecting one document is treated as approving/rejecting the provider's verification as a whole, since the current flow doesn't require multiple documents to be independently approved.
- Writes a row to `AuditLog` (`action: "KYC_REVIEW"`) recording which admin reviewed which request and the outcome — the admin-action audit trail called for in the SRS's non-functional/admin-dashboard requirements.

Errors: `404 { "error": "KYC request not found" }` if the id doesn't exist.

### View a KYC Document

**GET** `/api/admin/kyc/:kycId/document-url` → `200`:
```json
{ "url": "https://<project>.supabase.co/storage/v1/object/sign/everyskill-kyc-private/...", "expiresInSeconds": 600 }
```
A short-lived (10 min) signed URL for viewing any provider's uploaded document during review. Errors: `404 { "error": "KYC request not found" }`.

### List Administrators

**GET** `/api/admin/admins` — **SUPER_ADMIN only** → `200` — array of every `ADMIN`/`SUPER_ADMIN` account (`{ id, email, role, status, createdAt }`), oldest first.

### Create an Administrator

**POST** `/api/admin/admins` — **SUPER_ADMIN only**:
```json
{ "email": "new-admin@example.com", "password": "SuperSecret123", "role": "ADMIN" }
```
`email`, `password` (min 8 chars) required. `role` is `"ADMIN"` or `"SUPER_ADMIN"`, defaults to `"ADMIN"` if omitted. The account is created with `emailVerified: true` (no email-verification step for admin-created accounts). Response `201`: `{ id, email, role, status, createdAt }`.

Writes an `AuditLog` row (`action: "ADMIN_ACCOUNT_CREATED"`) recording which `SUPER_ADMIN` created the account.

Errors: `409 { "error": "An account with this email already exists" }`.

### Force-Reset an Administrator's Password

**PATCH** `/api/admin/admins/:userId/password` — **SUPER_ADMIN only**:
```json
{ "newPassword": "BrandNewPassword123" }
```
Directly sets the target account's password — no email/token round-trip. Only valid for accounts with role `ADMIN` or `SUPER_ADMIN` (use this for offboarding or lockout recovery, not for customers/providers). Response `204`. Also revokes the target's current refresh token (forces re-login on all devices) and clears any pending self-service reset token, and writes an `AuditLog` row (`action: "ADMIN_PASSWORD_FORCE_RESET"`).

Errors: `404 { "error": "Admin account not found" }` if the id doesn't exist or isn't an `ADMIN`/`SUPER_ADMIN`.

Note: the ordinary self-service flow (`POST /api/auth/forgot-password` + `POST /api/auth/reset-password`, described in the Auth Module above) also works unchanged for `ADMIN`/`SUPER_ADMIN` accounts — it's keyed by email regardless of role. This endpoint is only for a *super-admin acting on someone else's account*.

### Administrator Dashboard (FR23)

Four new standalone endpoints (ADMIN/SUPER_ADMIN, same as the rest of this module — no narrower `SUPER_ADMIN`-only gate, matching KYC/Disputes/Reports), plus one aggregation endpoint over all eight of FR23's bullets (Users, Verification, Reviews, Categories, Reports, Disputes, Analytics, Audit log).

**GET** `/api/admin/users` — every account across all roles. Optional `?role=CUSTOMER|PROVIDER|ADMIN|SUPER_ADMIN` and `?status=ACTIVE|SUSPENDED|BANNED` filters, combinable. Response `200`: array of `{ id, email, role, status, warningCount, emailVerified, createdAt, customerProfile: { firstName, lastName } | null, providerProfile: { displayName, verificationStatus } | null }`. No more PII than KYC review (FR4) already exposes to admins.

**GET** `/api/admin/reviews` → `200` — every review platform-wide, newest first (same shape as the customer/provider/listing review endpoints from FR16, but unfiltered).

**GET** `/api/admin/audit-log` → `200` — the `AuditLog` trail (every `KYC_REVIEW`, `ADMIN_ACCOUNT_CREATED`, `ADMIN_PASSWORD_FORCE_RESET`, `USER_REACTIVATED`, `REPORT_WARN`/`REPORT_SUSPEND`/`REPORT_BAN` entry written across this backend), newest first, each including `actor: { id, email, role }`. Optional `?action=` and `?targetType=` exact-match filters. **Capped at 100 rows** — unlike this codebase's other "list mine" endpoints, an audit log is an ever-growing history, not a small owned collection.

**GET** `/api/admin/analytics` → `200`:
```json
{
  "users": { "total": 13, "byRole": { "CUSTOMER": 4, "PROVIDER": 7, "ADMIN": 1, "SUPER_ADMIN": 1 }, "byStatus": { "ACTIVE": 13 } },
  "bookings": { "total": 1, "byStatus": { "DISPUTED": 1 } },
  "revenue": { "grossReleasedPaymentVolume": 60, "estimatedCommissionCollected": 6, "releasedPaymentCount": 1 },
  "reports": { "total": 1, "byStatus": { "PENDING": 1 } },
  "disputes": { "total": 1, "byStatus": { "OPEN": 1 } },
  "reviews": { "total": 1, "averageRating": 3 }
}
```
Platform-wide counts — deliberately simple derived numbers, not FR25's territory (no time-series/charts). **`revenue.estimatedCommissionCollected` is an approximation**: `Payment` only stores the gross amount, not the commission actually taken at capture time, so this recomputes using the *current* commission percent (FR24 "Commissions"). If the commission percent has ever changed, historical payments are misrepresented by this estimate — documented honestly rather than silently presented as exact.

**GET** `/api/admin/dashboard` → `200` — one aggregation over everything above:
```json
{
  "users": { "recent": ["...5 most recent accounts"], "total": 13, "byRole": {...}, "byStatus": {...} },
  "verification": { "pendingCount": 3, "recentPending": ["...5 oldest-first pending KycVerification rows"] },
  "reviews": { "recent": ["...5 most recent"], "total": 1, "averageRating": 3 },
  "categories": ["...all, same as GET /api/categories"],
  "reports": { "recent": ["...5 most recent"], "total": 1, "byStatus": {...} },
  "disputes": { "recent": ["...5 most recent"], "total": 1, "byStatus": {...} },
  "analytics": { "...": "same shape as GET /api/admin/analytics" },
  "auditLog": { "recent": ["...10 most recent entries"] }
}
```
`recent` lists are capped (5 each, 10 for the audit log) — a dashboard glance, not a data dump, same choice made for FR21/FR22. All counts/breakdowns are sourced from the same `getPlatformAnalytics()` that powers the standalone `/analytics` endpoint, so the dashboard and that endpoint can never disagree.

### Super Administrator Dashboard (FR24)

**GET** `/api/admin/super-dashboard` — **SUPER_ADMIN only** (`403` for a plain `ADMIN` token, same as the Administrator-management routes above). One aggregation over FR24's bullets, split into two groups per direct request ("do both"):

**Real, queryable data** — each backed by genuine platform state:
```json
{
  "administrators": ["...same as GET /api/admin/admins"],
  "platformSettings": { "...": "same as GET /api/admin/platform-settings" },
  "commissions": { "commissionPercent": 10, "note": "Same value as platformSettings.commissionPercent — the SRS lists it as its own bullet" },
  "gdpr": { "totalConsentRecords": 1, "totalDeletionRequests": 1, "recentConsents": ["...5 most recent ConsentRecord rows"] },
  "kyc": { "pendingCount": 3, "recentPending": ["...5 oldest-first, same data as FR23"] },
  "auditLog": { "recent": ["...10 most recent, same data as FR23 — AuditLog doesn't distinguish ADMIN from SUPER_ADMIN actions"] }
}
```
`gdpr` is new — nothing else in this app aggregates GDPR activity platform-wide (FR5 only exposes a customer's *own* consent history/export/deletion).

**Read-only status summaries** — for infrastructure that doesn't exist as a real, configurable system yet. These describe *current hardcoded behavior*, honestly labeled as non-configurable, rather than fabricating settings that wouldn't actually change anything if toggled:
```json
{
  "escrowPolicy": {
    "mode": "MANUAL_CAPTURE",
    "capturedOnBookingCompletion": true,
    "refundedOnCancelOrDispute": true,
    "note": "Reflects current payment.service.ts behavior — not configurable via any API"
  },
  "paymentGateways": {
    "active": ["stripe", "offline"],
    "stripeMode": "test",
    "note": "Single real gateway (plus manual offline payments) — not a multi-gateway system, nothing to switch between"
  },
  "aiSettings": {
    "provider": "groq",
    "textModel": "llama-3.1-8b-instant",
    "visionModel": "qwen/qwen3.6-27b",
    "configured": true,
    "note": "Configured via environment variables (GROQ_MODEL/GROQ_VISION_MODEL) — not dynamically editable via this API"
  },
  "localization": {
    "currency": "USD",
    "platformLanguages": ["en"],
    "note": "No multi-currency or platform i18n support exists. ProviderProfile.languages (FR3) is a provider's own spoken languages, not platform localization. 'Countries' has no concept anywhere in this system and is omitted entirely."
  },
  "notifications": {
    "channels": { "inApp": true, "push": false, "email": false, "sms": false },
    "note": "See Notifications (FR15) — only the in-app channel is implemented; not independently configurable here."
  }
}
```
`paymentGateways.stripeMode` is derived by checking whether `STRIPE_SECRET_KEY` starts with `sk_live_` vs `sk_test_` — the key itself is never exposed, only which mode it's in (or `"not configured"` if unset).

**Omitted entirely** (documented honestly, not represented even as a placeholder): **Countries** — no concept anywhere in this schema (no `Country` entity, no country field on any model). **Security logs** — `AuditLog` only records *admin actions* (KYC reviews, report moderation, account creation/reactivation), not security events like failed logins or password changes; a real security log would be genuinely new infrastructure, not a summary of something that already exists.

---

## Reports & Analytics (FR25)

Nine distinct endpoints under `/api/admin/reports/*` (ADMIN/SUPER_ADMIN, same gate as the rest of this module) — one per SRS bullet (Users, Providers, Bookings, Revenue, Service popularity, Customer satisfaction, Provider performance, Financial statistics, Platform growth), per direct request, rather than one combined payload like FR23/FR24's dashboards. Unlike those dashboards (current-state snapshots), most of these are genuine **time-series** reports — "growth" and trends over time, not just totals.

**Route note:** these live at `/api/admin/reports/users`, `/api/admin/reports/revenue`, etc. — two-segment paths. FR18's moderation `Report` endpoints also live under `/api/admin/reports` (`GET /reports`, `GET /reports/:reportId`, ...). There's no actual collision: Express matches routes in registration order, and these nine static paths are registered *before* FR18's `/reports/:reportId` param route in `admin.routes.ts`, so `/reports/users` always reaches the FR25 handler, never mistaken for a moderation report with id `"users"`. Verified live during testing.

### Time-series reports — date range & bucketing

**GET** `/api/admin/reports/users`, `/reports/providers`, `/reports/bookings`, `/reports/revenue`, `/reports/customer-satisfaction`, `/reports/growth` all accept:
| Param | Notes |
|---|---|
| `startDate`, `endDate` | ISO dates, both optional. If both omitted, defaults to a recent window scaled to `groupBy` (see below). `400` if `startDate` is after `endDate`. |
| `groupBy` | `"day"` \| `"week"` \| `"month"`, defaults to `"day"`. Weeks start Monday (ISO 8601). |

Default window when no dates are given: **last 30 days** for `groupBy=day`, **last 12 weeks** for `week`, **last 12 months** for `month` — scaled so you don't ask for monthly buckets and get back only one or two data points.

Every period between `start` and `end` appears in the response even with zero rows (e.g. a day with no new users still shows `{"period": "2026-07-15", "count": 0}`) — makes charting straightforward, no gap-filling needed client-side.

**GET** `/api/admin/reports/users` → `200`:
```json
{
  "range": { "start": "...", "end": "...", "groupBy": "day" },
  "newUsersByPeriod": [{ "period": "2026-07-01", "count": 3, "byRole": { "CUSTOMER": 2, "PROVIDER": 1 } }],
  "totalsByRole": { "CUSTOMER": 10, "PROVIDER": 7, "ADMIN": 1, "SUPER_ADMIN": 1 }
}
```

**GET** `/api/admin/reports/providers` → `200`: same shape, `newProvidersByPeriod`, plus `totalsByVerificationStatus` and `totalProviders`.

**GET** `/api/admin/reports/bookings` → `200`: `newBookingsByPeriod` (each period includes `byStatus`), plus `totalsByStatus`.

**GET** `/api/admin/reports/revenue` → `200`: `revenueByPeriod` (`grossAmount`/`paymentCount` per period, from `RELEASED` payments only), plus `totalGrossRevenue` and the same `estimatedCommissionCollected` approximation used in FR23/FR24 (current commission % applied retroactively — not historically exact).

**GET** `/api/admin/reports/customer-satisfaction` → `200`:
```json
{
  "averageRatingByPeriod": [{ "period": "...", "averageRating": 4.2, "reviewCount": 5 }],
  "ratingDistribution": { "1": 2, "2": 1, "3": 5, "4": 12, "5": 30 },
  "totalReviews": 50, "totalDisputes": 2, "totalBookings": 100,
  "disputeRate": 0.02
}
```
`disputeRate` = disputes opened in range ÷ bookings created in range — a rough proxy (this app has no satisfaction-survey data), `null` if there were zero bookings in range (avoids a division by zero).

**GET** `/api/admin/reports/growth` → `200`: `newUsersByPeriod`, `newBookingsByPeriod`, `revenueByPeriod` combined into one trend view — reuses the exact same underlying data as the three reports above.

### Ranking reports — top-N, not time-series

**GET** `/api/admin/reports/service-popularity` and `/reports/provider-performance` accept `startDate`, `endDate` (same defaulting as above, fixed **30-day** window when omitted — there's no `groupBy` concept for a ranking) and `limit` (default `10`, max `50`).

**GET** `/api/admin/reports/service-popularity` → `200`:
```json
{
  "range": { "start": "...", "end": "..." },
  "topListings": [{ "listingId": "...", "title": "...", "providerDisplayName": "...", "bookingCount": 12 }],
  "topCategories": [{ "categoryId": "...", "name": "...", "bookingCount": 20 }]
}
```
Ranked by number of bookings created in range.

**GET** `/api/admin/reports/provider-performance` → `200`:
```json
{
  "providers": [
    { "providerProfileId": "...", "displayName": "...", "bookingsInRange": 5, "completedBookingsInRange": 4,
      "averageRating": 4.6, "reviewCount": 10, "currentBalance": 540,
      "lateCancellationCount": 0, "noShowCount": 0 }
  ]
}
```
Ranked by `completedBookingsInRange` descending. `averageRating`/`reviewCount` reuse FR16's `getProviderRatingSummaries` (lifetime, not scoped to range). `lateCancellationCount`/`noShowCount`/`currentBalance` are lifetime totals too — only `bookingsInRange`/`completedBookingsInRange` are actually scoped to the date range, documented in the response's `note`.

### Snapshot report

**GET** `/api/admin/reports/financial` accepts `startDate`/`endDate` only (30-day default, no `groupBy`, no ranking) → `200`:
```json
{
  "grossRevenue": 5000, "totalRefunded": 120, "totalWithdrawn": 3000,
  "estimatedCommissionCollected": 500,
  "releasedPaymentCount": 42, "refundedPaymentCount": 2, "withdrawalCount": 8,
  "offlineBillsByStatus": { "PENDING": 1, "PAID": 3 },
  "paymentsByGateway": { "stripe": 40, "offline": 2 }
}
```
Broader than the Revenue report — adds refunds, withdrawals, offline-bill status, and gateway split, all scoped to the same date range.

All nine endpoints: `400 { "error": "Validation failed", ... }` for `startDate` after `endDate`, or an invalid `groupBy`/`limit`.

---

## Categories — `/api/categories` (FR6)

### List Categories

**GET** `/api/categories` → `200` — array of all categories (flat list, `{ id, name, parentId }`), ordered by name. No auth required. Build a tree client-side from `parentId` if needed.

### Create Category

**POST** `/api/categories` — **ADMIN/SUPER_ADMIN only**.
```json
{ "name": "Plumbing", "parentId": "category-uuid" }
```
`name` required and must be unique; `parentId` optional. Response `201`.

Errors: `404 { "error": "Parent category not found" }` if `parentId` doesn't exist; `409 { "error": "A category with this name already exists" }`.

### Update Category

**PATCH** `/api/categories/:categoryId` — **ADMIN/SUPER_ADMIN only**. Same fields as create, both optional. Pass `parentId: null` to move a category back to top-level.

Errors: `404 { "error": "Category not found" }`; `400 { "error": "A category cannot be its own parent" }`; `409` on duplicate name.

### Delete Category

**DELETE** `/api/categories/:categoryId` — **ADMIN/SUPER_ADMIN only** → `204`.

Errors: `404 { "error": "Category not found" }`; `409 { "error": "Cannot delete a category that has subcategories" }` or `409 { "error": "Cannot delete a category that has listings" }`.

---

## Service Listings — Provider management `/api/providers/me/listings` (FR6)

All routes below require `Authorization: Bearer <accessToken>` for a **PROVIDER** account (same auth rules as the rest of the Provider Module).

A listing can belong to **multiple categories** (many-to-many) — pass one or more ids in `categoryIds`.

### List my listings

**GET** `/api/providers/me/listings` → `200` — array of your own listings (including inactive ones), each with its `categories` array, newest first.

### Get one of my listings

**GET** `/api/providers/me/listings/:listingId` → `200`, including its `categories` array. Errors: `404 { "error": "Listing not found" }` if it doesn't exist or isn't yours.

### AI category recommendation (FR7)

**POST** `/api/providers/me/listings/recommend-category`:
```json
{
  "title": "Emergency Leak Repair",
  "description": "Same-day callout for burst pipes and leaks."
}
```
Call this **before** creating the listing, to get an AI-suggested category for your `title`/`description`, drawn from the existing `Category` list (see FR6 above — create categories first if none exist). Response `200`:
```json
{
  "category": { "id": "category-uuid", "name": "Plumbing" },
  "confidence": "high",
  "reasoning": "The listing describes emergency plumbing repair work."
}
```
This is advisory only — it doesn't create or modify anything; pass the returned `category.id` into `categoryIds` on the actual `POST /api/providers/me/listings` call if you want to use it.

Backed by [Groq](https://console.groq.com)'s free-tier OpenAI-compatible API (`GROQ_API_KEY` in `backend/.env` — see `.env.example`). Errors:
| Status | Body | Cause |
|---|---|---|
| `400` | `{ "error": "Validation failed", ... }` | Missing `title` or `description` |
| `409` | `{ "error": "No categories exist yet to recommend from" }` | No categories have been created (see Categories, FR6) |
| `500` | `{ "error": "AI category recommendation is not configured (missing GROQ_API_KEY)" }` | `GROQ_API_KEY` not set in `.env` |
| `502` | `{ "error": "Category recommendation service is unavailable" }` | Groq API request failed (network error or non-2xx response) |
| `502` | `{ "error": "Category recommendation service returned ..." }` | The model's response wasn't valid JSON, didn't match the expected shape, or named a category id that doesn't exist (hallucination guard) |

### Create a listing

**POST** `/api/providers/me/listings`:
```json
{
  "categoryIds": ["category-uuid-1", "category-uuid-2"],
  "title": "Emergency Leak Repair",
  "description": "Same-day callout for burst pipes and leaks.",
  "pricingType": "FIXED",
  "price": 75.00,
  "durationMinutes": 60,
  "images": ["https://example.com/listing1.jpg"],
  "serviceArea": "Greater London",
  "tags": ["plumbing", "emergency"],
  "cancellationCutoffHours": 24,
  "requiresDocumentation": true
}
```
`categoryIds` (non-empty array), `title`, `description`, `price`, `durationMinutes` required. `pricingType` is `"FIXED"` (price for the whole task) or `"HOURLY"` (price per hour) — defaults to `"FIXED"` if omitted. `price` means "total price for the task" under `FIXED`, or "rate per hour" under `HOURLY`; `durationMinutes` is always the estimated/scheduled duration (used for booking slots either way). `images`, `tags` default to `[]`; `cancellationCutoffHours` defaults to `24` (see FR13 — this is the cutoff, relative to the booking time, after which a customer cancellation or no-show gets recorded against the responsible party). `requiresDocumentation` defaults to `true` — set it to `false` for service types with nothing visual to document (e.g. a delivery service), to exempt this listing's bookings from FR17's completion/after-image requirement (see **Service Documentation (FR17)** below). Response `201`, with the created listing's `categories` array populated. Errors: `404 { "error": "One or more categories not found" }`.

### Update a listing

**PATCH** `/api/providers/me/listings/:listingId` — any subset of the create fields, plus `isActive: false` to unpublish (hide from public search) without deleting it. Passing `categoryIds` **replaces** the full set of categories (not a merge) — it must still be non-empty. Response `200`. Errors: `404` for unknown/not-yours listing, or `404 { "error": "One or more categories not found" }`.

### Delete a listing

**DELETE** `/api/providers/me/listings/:listingId` → `204`. Errors: `404 { "error": "Listing not found" }`.

### AI content assistance (FR19)

All three below are provider-only, operate on one of your own listings, and are purely advisory — none of them modify the listing; you decide whether to act on the suggestion via the ordinary `PATCH` above.

**GET** `/api/providers/me/listings/:listingId/completeness` → `200`:
```json
{ "isComplete": false, "missing": ["No images uploaded", "Description is very short (under 40 characters)"] }
```
Deterministic (no AI call, no hallucination risk, instant) — checks for missing images, a description under 40 characters, no tags, and no `serviceArea`.

**POST** `/api/providers/me/listings/:listingId/improve-description` → `200`:
```json
{ "improvedDescription": "...", "reasoning": "..." }
```
Sends your current `title`/`description` to Groq and asks for a clearer, more compelling rewrite that stays truthful to the original (never invents claims/credentials).

**POST** `/api/providers/me/listings/:listingId/suggest-keywords` → `200`:
```json
{ "keywords": ["plumber", "emergency plumbing", "leak repair"], "reasoning": "..." }
```
Suggests 3–8 search keywords based on your `title`/`description`/categories — a starting point for the listing's `tags`.

Errors for all three: `404` for unknown/not-yours listing; the improve-description/suggest-keywords endpoints can also return the same `500`/`502` Groq errors as FR7's category recommendation above.

---

## Service Listings — Public browsing `/api/listings` (FR6/FR9)

No auth required. Only listings with `isActive: true` are returned.

### Search / browse listings

**GET** `/api/listings` → `200` — array of listings, each including its `categories` array and a summary of the owning `providerProfile` (`id`, `displayName`, `providerType`, `verificationStatus`, `profileImage`, `serviceArea`, `latitude`, `longitude`), newest first (or by distance — see below).

Optional query params, all combinable:
| Param | Matches FR9 bullet | Notes |
|---|---|---|
| `search` | Keyword | Case-insensitive match on `title`/`description` |
| `categoryId` | Category | A listing can have multiple categories — matches if it has this one |
| `minPrice`, `maxPrice` | Budget | Inclusive range on `price` |
| `pricingType` | — | `"HOURLY"` or `"FIXED"` |
| `location` | Location | Case-insensitive substring match on the provider's `serviceArea` text |
| `latitude`, `longitude`, `radiusKm` | Distance | All three required together (`400` otherwise). Filters to providers within `radiusKm` km (great-circle/Haversine distance) of the given point, adds a `distanceKm` field to each result, and **overrides the default sort to ascending distance**. Only providers who've set their own `latitude`/`longitude` (via `PATCH /api/providers/me`) are considered. |
| `verified` | Verification | `true` → only providers with `verificationStatus: "VERIFIED"` |
| `minRating` | Rating | `1`–`5`. Only providers whose computed `averageRating` (FR16) is at least this. Providers with no reviews yet are excluded by any `minRating` filter. |
| `providerType` | Provider Type | `"INDIVIDUAL"` or `"BUSINESS"` |
| `availableDate` | Availability | ISO date (`YYYY-MM-DD`). Only providers with a declared open slot covering that date (recurring weekly or date-specific) **and no full-day block** (`isBlocked: true` with `startTime: "00:00"`/`endTime: "23:59"`) are included. Partial blocks (e.g. a lunch break) don't exclude a provider — this is a discovery-level check; exact time-slot conflicts are resolved at booking time (FR11). |
| `providerProfileId` | — | Listings from one specific provider |

Example: `GET /api/listings?categoryId=<uuid>&search=leak&location=London&verified=true&availableDate=2026-08-10&minPrice=20&maxPrice=100`

Example (distance): `GET /api/listings?latitude=51.5074&longitude=-0.1278&radiusKm=50`

### Get one listing

**GET** `/api/listings/:listingId` → `200`. Errors: `404 { "error": "Listing not found" }` if it doesn't exist or is inactive.

### Get a listing's availability

**GET** `/api/listings/:listingId/availability` → `200` — array of the owning provider's `AvailabilitySlot` rows (see FR8 below), so a customer can see when they could book before doing so. Errors: `404 { "error": "Listing not found" }` if the listing doesn't exist or is inactive.

### AI intelligent search (FR10)

**POST** `/api/listings/ai-search` — no auth required.
```json
{ "query": "I need an affordable plumber in London, budget under 100" }
```
Understands a free-text query and turns it into the same structured filters as the search above — `category`, `minPrice`/`maxPrice` (budget), `location`, `availableDate` (resolves relative phrases like "tomorrow" or "this weekend" against today's date), and `urgency` (`"low"`/`"medium"`/`"high"`, inferred from words like "emergency"/"asap" vs. "whenever" — not currently used to filter, since response-time data doesn't exist yet; see limitations below). Then runs the normal listing search with those extracted filters and returns both the interpretation and the results.

Response `200`:
```json
{
  "interpretation": {
    "category": { "id": "category-uuid", "name": "Plumbing" },
    "minPrice": null,
    "maxPrice": 100,
    "location": "London",
    "availableDate": null,
    "urgency": "medium",
    "explanation": "The user is looking for an affordable plumber in London, with a budget under $100."
  },
  "results": [
    {
      "...": "same shape as GET /api/listings results",
      "matchReasons": ["Matches requested service: Plumbing", "Within requested budget", "Serves London", "Verified provider"]
    }
  ]
}
```
`matchReasons` is computed deterministically from the actual filter values (not a separate AI call per result) — this is the "explain recommendations" requirement, satisfied without extra latency/hallucination risk. If nothing in the category list clearly matches the query, `category` comes back `null` and the search runs unfiltered by category rather than guessing.

**Current limitations** (documented honestly rather than silently no-op'd): ranking still only *orders* by verification/recency/distance — rating (FR16) is now surfaced as a `minRating` filter and a "Highly rated" match reason (see **Ratings & Reviews (FR16)** below), but isn't yet a sort key. Semantic similarity, response time, acceptance rate, and completed-jobs-based ranking are still **not implemented**, since Bookings (FR11) don't yet track response time/acceptance rate/completed-jobs counts.

Backed by [Groq](https://console.groq.com)'s free-tier API (`GROQ_API_KEY` in `.env`, same as FR7). Errors:
| Status | Body | Cause |
|---|---|---|
| `400` | `{ "error": "Validation failed", ... }` | Missing `query` |
| `500` | `{ "error": "AI search is not configured (missing GROQ_API_KEY)" }` | `GROQ_API_KEY` not set |
| `502` | `{ "error": "AI search — the AI service is unavailable" }` / `"... returned invalid JSON"` / `"... returned an unexpected shape"` / `"... returned an unknown category id"` | Groq request failed, or its response didn't parse/validate (includes the same hallucination guard as FR7) |

---

## Availability & Schedule Management — `/api/providers/me/availability` (FR8)

All routes below require `Authorization: Bearer <accessToken>` for a **PROVIDER** account (same auth rules as the rest of the Provider Module).

An `AvailabilitySlot` is either:
- **Recurring weekly**: `dayOfWeek` set (`0`=Sunday … `6`=Saturday), `date` omitted — repeats every week.
- **Specific-date**: `date` set (e.g. a holiday or a one-off extra shift), `dayOfWeek` omitted.

Exactly one of `dayOfWeek`/`date` must be provided — never both, never neither. `startTime`/`endTime` are 24-hour `"HH:MM"` strings, and `endTime` must be after `startTime`.

`isBlocked` distinguishes an **open** window (`false`, the default) from a **blocked** one (`true`, e.g. a lunch break or a day off). A blocked window is allowed to overlap an open window on the same `dayOfWeek`/`date` — that's how you carve out a break inside a working day. Two **open** windows overlapping on the same `dayOfWeek`/`date` are rejected, since that would be an ambiguous/duplicate availability definition.

Note: this defines a provider's *declared* availability. Real double-booking prevention against actual bookings (checking a requested exact time + duration against both these slots and other confirmed bookings) is enforced by the Booking module — see **Booking Management (FR11)** below.

### List my availability

**GET** `/api/providers/me/availability` → `200` — array of all your slots (recurring and specific-date, open and blocked), ordered by day/date/time.

### Create an availability slot

**POST** `/api/providers/me/availability`:
```json
{ "dayOfWeek": 1, "startTime": "09:00", "endTime": "17:00" }
```
Or a specific-date block:
```json
{ "date": "2026-08-15", "startTime": "00:00", "endTime": "23:59", "isBlocked": true }
```
Response `201`. Errors:
| Status | Body | Cause |
|---|---|---|
| `400` | `{ "error": "Validation failed", ... }` | Both/neither `dayOfWeek`/`date` provided, bad `HH:MM` format, or `endTime` not after `startTime` |
| `409` | `{ "error": "This availability window overlaps with an existing available slot" }` | Another **open** slot already covers part of this time range on the same `dayOfWeek`/`date` |

### Update an availability slot

**PATCH** `/api/providers/me/availability/:slotId` — any subset of the create fields (including switching between `dayOfWeek` and `date` — pass the other one as `null` to clear it). Re-validates the exactly-one-of rule, time ordering, and overlap (excluding itself) after merging with the existing row. Response `200`. Errors: same shapes as create, plus `404 { "error": "Availability slot not found" }` if it doesn't exist or isn't yours.

### Delete an availability slot

**DELETE** `/api/providers/me/availability/:slotId` → `204`. Errors: `404 { "error": "Availability slot not found" }`.

---

## Booking Management (FR11)

Booking workflow states: `REQUESTED → ACCEPTED → IN_PROGRESS → COMPLETED`, with `CANCELLED`/`DECLINED` as exits and `DISPUTED` reachable from `ACCEPTED`/`IN_PROGRESS`/`COMPLETED` (see **Cancellation & Dispute Resolution (FR13)** below). Every transition is validated server-side and recorded in `BookingStatusHistory` (returned as `statusHistory` on the single-booking `GET` endpoints below).

Allowed transitions (anything else → `409 { "error": "Cannot transition booking from X to Y" }`):
```
REQUESTED   → ACCEPTED | DECLINED | CANCELLED
ACCEPTED    → IN_PROGRESS | CANCELLED | DISPUTED
IN_PROGRESS → COMPLETED | CANCELLED | DISPUTED
COMPLETED   → DISPUTED
DISPUTED    → COMPLETED | CANCELLED (via dispute resolution only, FR13 — never a direct action)
CANCELLED / DECLINED → (terminal — no further transitions)
```

**Double-booking prevention**: creating a booking checks the exact requested time + the listing's `durationMinutes` against (a) the provider's declared `AvailabilitySlot`s (FR8) — must be fully covered by an open window and not intersected by a blocked one — and (b) every other booking for that provider that isn't `CANCELLED`/`DECLINED`, for a real time-range overlap. Bookings that would cross midnight aren't supported by the current slot model and are rejected.

**Payment sync (FR12)**: marking a booking `COMPLETED` automatically releases its escrowed payment (if any); marking it `CANCELLED` automatically refunds it (if any) — see **Escrow Payment System (FR12)** below. A booking with no payment (never paid, or paid then already resolved) is unaffected — this is a no-op, not an error.

**Cancellation consequences, no-shows, disputes, and rescheduling** are all covered in **Cancellation & Dispute Resolution (FR13)** below.

### Customer — create and manage my bookings `/api/customers/me/bookings`

Requires `Authorization: Bearer <accessToken>` for a **CUSTOMER** account.

**GET** `/api/customers/me/bookings` → `200` — array of all your bookings (with `listing`, `providerProfile`, `payment` included), newest first.

**POST** `/api/customers/me/bookings`:
```json
{
  "listingId": "listing-uuid",
  "scheduledAt": "2026-08-10T09:00:00.000Z"
}
```
`price` is copied from the listing at booking time (a snapshot — later listing price changes don't retroactively affect existing bookings). Response `201`, status starts as `REQUESTED`.

Errors:
| Status | Body | Cause |
|---|---|---|
| `400` | `{ "error": "Validation failed", ... }` | Missing/invalid `listingId` or `scheduledAt` |
| `404` | `{ "error": "Listing not found" }` | Listing doesn't exist or is inactive |
| `400` | `{ "error": "scheduledAt must be in the future" }` | Requested time is in the past |
| `400` | `{ "error": "Requested time is outside the provider's declared availability" }` | No open `AvailabilitySlot` covers the full requested time range, or a blocked one intersects it |
| `409` | `{ "error": "This time conflicts with an existing booking for this provider" }` | Overlaps another active booking for the same provider |

**GET** `/api/customers/me/bookings/:bookingId` → `200` — one booking including `statusHistory`. Errors: `404 { "error": "Booking not found" }` if it doesn't exist or isn't yours.

**PATCH** `/api/customers/me/bookings/:bookingId/cancel`:
```json
{ "cancellationReason": "Change of plans" }
```
`cancellationReason` optional. Only valid from `REQUESTED`/`ACCEPTED`/`IN_PROGRESS`. Response `200`. Errors: `404` if not found/not yours; `409` if the booking is already in a terminal state.

### Provider — manage bookings against my listings `/api/providers/me/bookings`

Requires `Authorization: Bearer <accessToken>` for a **PROVIDER** account.

**GET** `/api/providers/me/bookings` → `200` — array of all bookings against your listings, newest-scheduled first.

**GET** `/api/providers/me/bookings/:bookingId` → `200` — one booking including `statusHistory`. Errors: `404 { "error": "Booking not found" }` if it doesn't exist or isn't yours.

**PATCH** `/api/providers/me/bookings/:bookingId/accept` — no body → `REQUESTED → ACCEPTED`. Response `200`.

**PATCH** `/api/providers/me/bookings/:bookingId/decline` — no body → `REQUESTED → DECLINED`. Response `200`.

**PATCH** `/api/providers/me/bookings/:bookingId/start` — no body → `ACCEPTED → IN_PROGRESS`. Response `200`.

**PATCH** `/api/providers/me/bookings/:bookingId/complete` — no body → `IN_PROGRESS → COMPLETED`. **Requires at least one `COMPLETION` and one `AFTER` service-documentation image to already exist for this booking** (FR17, see **Service Documentation (FR17)** below) — `409 { "error": "Cannot complete this booking — at least one completion image and one after image are required first" }` otherwise. This gate does **not** apply to a booking reaching `COMPLETED` via dispute resolution (`DISMISS`/`RELEASE_PROVIDER` — FR13) — an admin's override authority isn't blocked by missing proof-of-work photos. Response `200`.

**PATCH** `/api/providers/me/bookings/:bookingId/cancel`:
```json
{ "cancellationReason": "Provider unavailable due to an emergency" }
```
`cancellationReason` optional. Same allowed-from states as the customer's cancel. Response `200`.

All six action endpoints share these errors: `404 { "error": "Booking not found" }` if it doesn't exist or isn't yours; `409 { "error": "Cannot transition booking from X to Y" }` if the current status doesn't allow that action.

---

## Extra Charges — mid-job price increases

If a provider finds extra work is needed partway through a job (e.g. unexpected damage), they can propose an additional charge; it only takes effect once the customer explicitly approves it.

**POST** `/api/providers/me/bookings/:bookingId/extra-charges` — **PROVIDER**, must own the booking, which must be `ACCEPTED` or `IN_PROGRESS`.
```json
{ "amount": 25, "reason": "Found additional plumbing damage requiring extra parts" }
```
Response `201`: the created `ExtraCharge` (`status: "PENDING"`). Errors: `404` if not found/not yours; `409` if the booking is in any other status.

**PATCH** `/api/customers/me/bookings/:bookingId/extra-charges/:chargeId/respond` — **CUSTOMER**, must own the booking.
```json
{ "approve": true }
```
`approve: true` ⇒ `status: "APPROVED"` and the booking's `price` is **increased** by the charge's `amount` (a permanent record of the total owed — doesn't retroactively affect an already-paid original amount). `approve: false` ⇒ `status: "REJECTED"`, nothing else changes. Response `200`. Errors: `404` if not found; `409 { "error": "This extra charge has already been X" }` if it's not still `PENDING`.

**POST** `/api/customers/me/bookings/:bookingId/extra-charges/:chargeId/pay` — **CUSTOMER**, must own the booking, charge must be `APPROVED`.
```json
{ "method": "stripe", "paymentMethodId": "pm_card_visa" }
```
Same `method: "stripe" | "offline"` shape as booking payment (see Escrow Payment System below) — the offline branch returns the same `{ extraCharge, disclaimer, amountDue, platformBill }` shape. Unlike the main booking payment, this is captured **immediately** (no escrow hold) — by the time an extra charge is being requested, the work is already underway, so there's no need for the same up-front trust mechanism as the initial booking payment. On success, `ExtraCharge.paymentStatus` → `"RELEASED"` and (for the Stripe path) the provider's balance is credited immediately, net of commission. Response `201`.

Errors: `404` if not found/not yours; `409 { "error": "This extra charge must be approved before it can be paid" }` if not yet `APPROVED`; `409 { "error": "This extra charge has already been paid" }` if already paid; `402` on a declined card (recorded as `paymentStatus: "FAILED"`, retriable just like booking payments).

Extra charges (with their `status`/`paymentStatus`) are included in the `extraCharges` array on every booking `GET` response (both customer and provider sides).

---

## Escrow Payment System (FR12)

Payment status: `PENDING → ESCROW → RELEASED` (happy path) or `→ REFUNDED` (cancelled before completion) or `FAILED` (card declined / gateway error). Backed by **Stripe** in **test mode** — no real card or money is ever involved. A `Payment` row is created only once a customer actually pays; a booking with no `Payment` is simply unpaid (nothing in the flow requires payment).

**Setup**: set `STRIPE_SECRET_KEY` in `backend/.env` to a Stripe **test-mode secret key** (`sk_test_...`, free at https://dashboard.stripe.com/test/apikeys — use the *secret* key, not the publishable one; the publishable key is for client-side/frontend code, which doesn't exist yet here). Without it, `POST .../pay` returns `500`.

**Test PaymentMethod ids** (Stripe's well-known test tokens — no real card needed):
| Id | Result |
|---|---|
| `pm_card_visa` (default if `paymentMethodId` omitted) | Always succeeds |
| `pm_card_chargeDeclined` | Always fails with a card-decline error |

### Pay for a booking

**POST** `/api/customers/me/bookings/:bookingId/pay` — **CUSTOMER** account, must own the booking.
```json
{ "method": "stripe", "paymentMethodId": "pm_card_visa" }
```
`method` is `"stripe"` (default) or `"offline"` — see **Offline Payments** below for the offline branch's response shape. `paymentMethodId` optional (Stripe path only), defaults to `pm_card_visa`. For `"stripe"`, this creates a Stripe PaymentIntent with `capture_method: "manual"` (the funds are authorized/held, not yet captured — this *is* the escrow) and confirms it immediately. Response `201`: the created `Payment` row (`{ id, bookingId, amount, gateway: "stripe", status, transactionRef, createdAt, updatedAt }`), with `status: "ESCROW"` on success.

Only valid once the booking is `ACCEPTED` (pay after the provider commits, not while still just `REQUESTED`). Failed attempts (e.g. a declined card) are recorded as a `Payment` row with `status: "FAILED"` — this does **not** permanently block the booking: retrying `pay` again (e.g. with a different `paymentMethodId`) clears the failed record and tries again. A booking can only ever have one *non-failed* payment (`Payment.bookingId` is unique).

Errors:
| Status | Body | Cause |
|---|---|---|
| `404` | `{ "error": "Booking not found" }` | Doesn't exist or isn't yours |
| `409` | `{ "error": "Cannot pay for a booking in status X — it must be ACCEPTED first" }` | Booking isn't `ACCEPTED` yet |
| `409` | `{ "error": "This booking already has a payment" }` | A non-`FAILED` `Payment` already exists for this booking |
| `402` | `{ "error": "Payment failed: <Stripe's message>" }` | Stripe declined the card or the PaymentIntent otherwise failed |
| `500` | `{ "error": "Escrow payments are not configured (missing STRIPE_SECRET_KEY)" }` | `STRIPE_SECRET_KEY` not set |

### Release and refund — automatic, not separate endpoints

There is no manual "release" or "refund" endpoint. Instead, payment status is **synchronized to booking status** (see Booking Management above):
- Booking → `COMPLETED` ⇒ the escrowed PaymentIntent is **captured** (funds move from held to released) ⇒ `Payment.status` → `RELEASED`, and the provider's platform **balance** is credited `amount - commission` (see Platform Commission below).
- Booking → `CANCELLED` ⇒ the escrowed PaymentIntent is **cancelled** (the hold is released, no charge ever occurs) ⇒ `Payment.status` → `REFUNDED`. No balance change (nothing was ever credited).

Both are no-ops if the booking has no payment, or its payment isn't currently `ESCROW` (e.g. already resolved, or never paid).

### Transaction history

**GET** `/api/customers/me/payments` → `200` — every payment across your own bookings, newest first (Customer Module, above).

**GET** `/api/providers/me/payments` → `200` — every payment across bookings for your listings, newest first, each including the `booking`. Requires a **PROVIDER** account.

---

## Platform Commission (FR24 "Commissions")

A single, platform-wide commission percentage is deducted whenever a payment (or extra charge, see below) is released to a provider. Stored as a singleton `PlatformSettings` row (auto-created with a `10%` default the first time it's read).

**GET** `/api/admin/platform-settings` — **ADMIN or SUPER_ADMIN** → `200`:
```json
{ "id": "...", "commissionPercent": "10", "updatedById": null, "createdAt": "...", "updatedAt": "..." }
```

**PATCH** `/api/admin/platform-settings` — **SUPER_ADMIN only**:
```json
{ "commissionPercent": 15 }
```
`commissionPercent` is `0`–`100`. Response `200`: the updated settings row. Errors: `400` on an out-of-range value; `403` for a plain `ADMIN` token.

---

## Provider Balance & Withdrawals

Providers accumulate a platform-held **balance** from released Stripe payments/extra charges (net of commission), which they can withdraw at any time. **Withdrawals are simulated** — no real bank transfer happens (that would require Stripe Connect, a separate provider-side onboarding integration that's out of scope here); withdrawing just marks the ledger amount as paid out.

**GET** `/api/providers/me/balance` — **PROVIDER** → `200`:
```json
{ "id": "...", "providerProfileId": "...", "availableBalance": "90", "createdAt": "...", "updatedAt": "..." }
```
Returns `{ providerProfileId, availableBalance: 0 }` if the provider has never had a payment released yet (no `ProviderBalance` row exists).

**POST** `/api/providers/me/balance/withdraw`:
```json
{ "amount": 50 }
```
`amount` optional — omit it to withdraw the **entire** available balance. Response `201`: the created `WithdrawalRequest` row (`{ id, providerProfileId, amount, createdAt }`) — withdrawals are instant and always "complete" in this simulated model.

Errors: `400 { "error": "Nothing available to withdraw" }` if `amount` is `0`/negative, or balance is `0`; `409 { "error": "Withdrawal amount exceeds available balance" }` if `amount` is more than what's available (or no balance row exists at all).

**GET** `/api/providers/me/withdrawals` → `200` — full withdrawal history, newest first.

---

## Offline Payments

At the same "pay" step as escrow (`POST .../pay` or `.../extra-charges/:chargeId/pay`, see Extra Charges below), a customer can choose to pay the provider **directly, outside the platform** (cash, bank transfer between the two of them, etc.) instead of through Stripe.

```json
{ "method": "offline" }
```

Response `201`:
```json
{
  "payment": { "id": "...", "bookingId": "...", "amount": "100", "gateway": "offline", "status": "RELEASED", "transactionRef": null, "createdAt": "...", "updatedAt": "..." },
  "disclaimer": "This is an offline payment made directly between you and the provider. EverySkill does not guarantee, hold, or protect offline payments — there is no escrow and no refund process through the platform if something goes wrong. Make sure to pay the provider the full amount owed.",
  "amountDue": 100,
  "platformBill": { "id": "...", "providerProfileId": "...", "bookingId": "...", "sourceType": "BOOKING_PAYMENT", "amount": "10", "status": "PENDING", "dueAt": "...", "paidAt": null, "paidVia": null, "createdAt": "...", "updatedAt": "..." }
}
```
- `disclaimer` is always returned so a client UI can surface the "not guaranteed" warning prominently, and `amountDue` restates exactly what the customer owes the provider.
- The `Payment` (or `ExtraCharge`) is immediately marked `RELEASED` — from the platform's bookkeeping perspective the provider already has the money in hand, so **no balance credit happens** (they never gave the platform custody of it — there's nothing to "withdraw" for an offline payment).
- Since the platform never touched real money for this transaction, it didn't collect its commission automatically — so a **commission bill** (`platformBill`) is created instead. See below.

---

## Offline Payment Bills & Provider Suspension

Every offline payment/extra-charge creates an `OfflinePaymentBill` for the commission the platform would have collected, due **5 days** after creation.

**GET** `/api/providers/me/bills` — **PROVIDER** → `200` — every bill (any status), newest first, each including its `booking`.

**POST** `/api/providers/me/bills/:billId/pay`:
```json
{ "method": "stripe", "paymentMethodId": "pm_card_visa" }
```
or
```json
{ "method": "balance" }
```
`"stripe"` charges the provider directly (same test PaymentMethod ids as customer payments); `"balance"` deducts the owed amount from the provider's own platform balance instead (fails with `409` if insufficient). Response `200`: the updated bill, `status: "PAID"`. If this was the provider's **last** unpaid/overdue bill, their account is automatically reactivated (see suspension below). Errors: `404` if not found/not yours; `409` if already paid or (for `"balance"`) insufficient funds.

### The 5-day enforcement (real scheduled job)

A `node-cron` job (`backend/src/jobs/offlineBillingCron.ts`) runs **once daily at midnight** server time: it finds every `PENDING` bill past its `dueAt`, marks it `OVERDUE`, and sets that provider's `User.status` to `SUSPENDED`.

- **Suspended accounts cannot log in** (`POST /api/auth/login` → `403 { "error": "Your account has been suspended. Please contact support." }`).
- Their **refresh token is deliberately left valid**, though — if the login block also revoked it, a provider with no other active session would have *no way back into the API at all*, not even to pay off the bill and get reinstated. So: a still-valid refresh token (from before suspension) can still be used at `POST /api/auth/refresh` to mint new access tokens, which can then hit `GET/POST /providers/me/bills` to settle up. Once *all* overdue bills are paid, the account flips back to `ACTIVE` automatically and login works again.
- **Known limitation**: if a provider's refresh token had already expired (7 days) or been logged out *before* they got suspended, there is currently no API path back in — that would need a manual admin/support intervention, which isn't built.

---

## Cancellation & Dispute Resolution (FR13)

Covers the SRS's FR13 bullets (request cancellation — already built in FR11; open disputes; admin resolution; dispute history; cancellations-after-cutoff and no-shows logged against the responsible party) plus two extensions added per direct request: a **reschedule** alternative to a late cancellation, and a violation-count **"standing"** with automatic suspension.

### Reschedule — an alternative to cancelling late

Either party can propose moving a booking to a new time instead of cancelling it (and instead of it counting as a violation, since a successful reschedule never touches the booking's status).

**POST** `/api/customers/me/bookings/:bookingId/reschedule` or **POST** `/api/providers/me/bookings/:bookingId/reschedule` — booking must be `ACCEPTED`/`IN_PROGRESS` and owned by the caller.
```json
{ "proposedAt": "2026-08-11T13:00:00.000Z" }
```
Validates the proposed time exactly like creating a booking: must be in the future, within the provider's declared availability (FR8), and not conflicting with another booking. Only one `PENDING` reschedule request is allowed per booking at a time. Response `201`: the created `RescheduleRequest` (`{ id, bookingId, proposedAt, requestedById, status: "PENDING", respondedAt, createdAt }`).

**PATCH** `/api/customers/me/bookings/:bookingId/reschedule/:requestId/respond` or the equivalent `/api/providers/...` path — must be the *other* party (not whoever proposed it).
```json
{ "approve": true }
```
`approve: true` re-validates availability/conflict at response time (in case something changed since the proposal) and, if still clear, updates `Booking.scheduledAt` to the proposed time — `RescheduleRequest.status` → `"ACCEPTED"`. `approve: false` → `"REJECTED"`, booking untouched (the original party can then propose again, or proceed with a normal cancellation). Response `200`.

Errors: `404` if the booking/request doesn't exist or isn't yours; `409` if you try to respond to your own proposal, if the request isn't `PENDING` anymore, or (on `approve: true`) if the proposed time is no longer available/now conflicts; `400` if `proposedAt` isn't in the future.

### No-shows

A dedicated action for "the other party never showed up" — distinct from a normal mutual cancellation.

**PATCH** `/api/providers/me/bookings/:bookingId/no-show` — provider marks the **customer** as a no-show.
**PATCH** `/api/customers/me/bookings/:bookingId/no-show` — customer marks the **provider** as a no-show.

No body for either. Booking must be `ACCEPTED`/`IN_PROGRESS` and its `scheduledAt` must already be in the past (`400` otherwise — you can't no-show an appointment that hasn't happened yet). On success: booking → `CANCELLED` (same payment-refund sync as any cancellation — FR12), `Booking.noShowBy` set to `"CUSTOMER"` or `"PROVIDER"`, and a violation is logged against the named party (see Standing below). Response `200`.

### Late cancellations & "standing"

Cancelling an `ACCEPTED`/`IN_PROGRESS` booking (via the ordinary `PATCH .../bookings/:bookingId/cancel` from FR11) is checked against the listing's `cancellationCutoffHours`: if the time remaining until `scheduledAt` is less than the cutoff, a violation is logged against **whoever initiated the cancellation**. Cancelling a booking that's still just `REQUESTED` (never accepted) never counts, since the provider hadn't committed yet.

Each `CustomerProfile`/`ProviderProfile` tracks `lateCancellationCount` and `noShowCount` (visible on `GET /api/customers/me` and `GET /api/providers/me`) — this is the SRS's "standing." Once a party's **combined total reaches 3**, their account is automatically set to `SUSPENDED` (same login-blocking behavior as FR12's offline-billing suspension). **Unlike** FR12's suspension, there is no automatic reinstatement — an `ADMIN`/`SUPER_ADMIN` must manually reactivate:

**PATCH** `/api/admin/users/:userId/reactivate` — `ADMIN`/`SUPER_ADMIN`, no body. Errors: `404` if the user doesn't exist; `409 { "error": "Cannot reactivate a user with status X" }` if they're not currently `SUSPENDED`. Response `200`: `{ id, email, role, status }`. (This endpoint is a general-purpose override — `User.status` doesn't track *why* an account was suspended, so it also works as a manual escape hatch for any other suspension reason.)

### Disputes

**POST** `/api/customers/me/bookings/:bookingId/dispute` or **POST** `/api/providers/me/bookings/:bookingId/dispute` — booking must be `ACCEPTED`/`IN_PROGRESS`/`COMPLETED` and owned by the caller; one dispute per booking.
```json
{ "reason": "Work was not completed to the agreed standard" }
```
Response `201`: the created `Dispute` (`status: "OPEN"`), and the booking transitions to `DISPUTED` (freezing it out of the normal accept/decline/start/complete/cancel actions until resolved). Errors: `404` if the booking isn't found/yours; `409` if the booking isn't in a disputable status, or a dispute already exists for it.

**GET** `/api/admin/disputes` — `ADMIN`/`SUPER_ADMIN`, optional `?status=OPEN|UNDER_REVIEW|RESOLVED|REJECTED` filter → array of disputes, each including the full `booking` (with `customer`, `providerProfile`, `listing`, `payment`).

**GET** `/api/admin/disputes/:disputeId` → same shape, single dispute. Errors: `404` if not found.

**PATCH** `/api/admin/disputes/:disputeId/review` — no body. `OPEN` → `UNDER_REVIEW` (a lightweight bookkeeping step before a final decision). Errors: `409` if not currently `OPEN`.

**PATCH** `/api/admin/disputes/:disputeId/resolve`:
```json
{ "decision": "REFUND_CUSTOMER", "resolution": "Provider confirmed to have not shown up; refunding customer." }
```
`decision` is one of:
| Decision | Dispute status | Booking status | Payment effect |
|---|---|---|---|
| `"RELEASE_PROVIDER"` | `RESOLVED` | `COMPLETED` | If still `ESCROW`, captured (same as a normal completion) and the provider's balance is credited net-of-commission. If already `RELEASED`, no-op. |
| `"REFUND_CUSTOMER"` | `RESOLVED` | `CANCELLED` | If still `ESCROW`, cancelled (pre-capture, same as a normal cancellation). If already `RELEASED` (captured), a **real Stripe refund** is issued and the provider's credited balance is **clawed back** by the same net amount — this can drive the balance negative if they've already withdrawn it (see limitation below). |
| `"DISMISS"` | `REJECTED` | `COMPLETED` | No payment action — the dispute is thrown out, booking returns to normal. |

Response `200`: the updated `Dispute`. Errors: `404` if not found; `409 { "error": "This dispute has already been X" }` if already `RESOLVED`/`REJECTED`.

**Not yet implemented / known limitations** (documented honestly): if a payment was paid **offline** (FR12) and is disputed, there's no real Stripe charge to refund — the parties must settle up between themselves, the API can't move that money. A negative provider balance from a clawed-back refund has no dedicated "provider owes platform" billing flow (unlike FR12's offline-commission bills) — it just sits negative until offset by future earnings.

---

## In-App Messaging (FR14)

Every booking gets its own `Conversation` automatically the moment it's created — there's no separate "start a conversation" step. Only the booking's customer and provider can read or send messages in it.

**GET** `/api/customers/me/bookings/:bookingId/messages` or **GET** `/api/providers/me/bookings/:bookingId/messages` → `200` — every message in the booking's conversation, oldest first, each including `sender` (`{ id, email, role }`). Returns `[]` for a brand-new booking with no messages yet — never `404` for a booking you own. Errors: `404 { "error": "Booking not found" }` if it doesn't exist or isn't yours.

**POST** `/api/customers/me/bookings/:bookingId/messages` or **POST** `/api/providers/me/bookings/:bookingId/messages`:
```json
{ "content": "Hi, what time will you arrive?" }
```
or, for an image attachment:
```json
{ "imageUrl": "https://example.com/before-photo.jpg" }
```
`content` and `imageUrl` are each optional, but **at least one is required** — a message can be text-only, image-only, or both. `imageUrl` must already be a real URL (upload the file first via `POST /api/uploads`, the generic public-upload endpoint, then pass the returned URL here — there's no dedicated messaging-image upload route). Response `201`: the created `Message`.

Errors: `400 { "error": "Validation failed", ... }` if neither `content` nor `imageUrl` is provided, or `imageUrl` isn't a valid URL; `404 { "error": "Booking not found" }` if it doesn't exist or isn't yours.

**Not yet implemented** (documented honestly): real-time delivery (the SRS/tech-stack mentions Firebase Firestore or Socket.io for this) — messages are plain request/response REST, so a client has to poll `GET .../messages` for updates. Read receipts also aren't tracked (`Message` has no `isRead` field).

---

## Notifications (FR15)

**Scope decision (per direct request):** the SRS lists four channels — In-app, Push, Email, SMS. Only **In-app** is implemented. There's no push/email/SMS provider wired up yet (that's FR28, not started), so every notification is created with `channel: "IN_APP"` and delivered purely by the client polling the endpoints below. `NotificationChannel` (`IN_APP | PUSH | EMAIL | SMS`) already exists on the `Notification` model for when those channels are added — no schema change will be needed, just a real sender behind each channel.

There's no dedicated `/api/notifications` router — like Messaging/Disputes/Rescheduling, notifications are a shared concept exposed identically under both role prefixes, backed by one `notification.service.ts`. A user only ever sees their own notifications regardless of role.

**GET** `/api/customers/me/notifications` or **GET** `/api/providers/me/notifications` → `200` — array of the caller's notifications, newest first. Optional query param `?unreadOnly=true` restricts to unread only.

**GET** `.../me/notifications/unread-count` → `200` — `{ "unreadCount": number }`.

**PATCH** `.../me/notifications/:notificationId/read` → `200` — marks a single notification read, returns the updated `Notification`. `404 { "error": "Notification not found" }` if it doesn't exist or belongs to someone else.

**PATCH** `.../me/notifications/read-all` → `200` — `{ "updated": number }`, marks every one of the caller's unread notifications as read.

Every `Notification` has: `type` (a free-text string, not a Prisma enum — new kinds can be added without a migration; see `NotificationType` in `notification.service.ts` for the full current list), `content` (human-readable text), `referenceId` (usually the related `bookingId`, `null` when there isn't one — e.g. `ACCOUNT_REACTIVATED`), `isRead`, `createdAt`.

**Triggers wired up** (fire-and-forget calls into `notify()` from each owning module's service, the same cross-module pattern already used by Disputes calling into Booking/Payment):
- **Bookings**: request created, accepted, declined, started, completed, cancelled (by either party), no-show (either party), account auto-suspended after 3 violations.
- **Reschedule**: proposed (to the other party), responded (to the original requester).
- **Messages**: every new message (to the conversation's other participant), content truncated to 140 chars (or "Sent an image" if image-only).
- **Payments**: escrow received (stripe or offline), released on completion, refunded (plain cancellation or post-capture dispute refund), offline commission bill created.
- **Extra Charges**: requested (to customer), approved/rejected (to provider).
- **Disputes**: opened (to the other party), resolved (to both parties, with the outcome in the text).
- **Verification**: KYC reviewed (approved/rejected, to the provider).
- **Account**: reactivated by an admin; suspended by the offline-billing cron job; suspended/banned/warned via a moderation report (FR18).
- **Reviews (FR16)**: posted (to the provider), replied (to the customer).
- **Reports (FR18)**: filed (fans out to every `ADMIN`/`SUPER_ADMIN`).

Recipients aren't limited to customers/providers — `ADMIN`/`SUPER_ADMIN` accounts receive notifications too (the `REPORT_FILED` fan-out above) and can read them via the identical four endpoints mounted under `/api/admin` (see **Reporting & Moderation (FR18)** below) — this was added alongside FR18 once it became the first thing that actually notifies an admin.

**Not yet implemented / known limitations** (documented honestly): **Promotions (FR26)** notification kinds are absent — that module doesn't exist yet. No admin-facing "notification settings" management (the SRS's FR24 admin settings list mentions "Notifications" as a configurable item; that would be a separate settings/preferences feature and wasn't requested). No pruning/expiry — notifications accumulate indefinitely per user.

---

## Ratings & Reviews (FR16)

A `Review` is created by a customer for one of their own **`COMPLETED`** bookings — `bookingId` is unique on the `Review` table, so a booking can only ever be reviewed once. **Reviews are immutable once posted** (per direct request) — there's no edit/delete endpoint, matching this codebase's pattern for other historical records (audit logs, status history, dispute resolutions).

**POST** `/api/customers/me/bookings/:bookingId/review`:
```json
{ "rating": 5, "comment": "Excellent service!", "images": ["https://example.com/photo1.jpg"] }
```
`rating` is required, an integer `1`–`5`. `comment` and `images` are both optional (`images` must already be real URLs — upload first via `POST /api/uploads`, the generic public-upload endpoint). Response `201`: the created `Review`.

Errors: `400 { "error": "Validation failed", ... }` if `rating` is missing or outside `1`–`5`; `404 { "error": "Booking not found" }` if it doesn't exist or isn't yours; `409` if the booking isn't `COMPLETED` yet, or if it's already been reviewed.

**GET** `/api/customers/me/reviews` → `200` — every review the caller has written, newest first, each including `booking` (with `listing`).

**GET** `/api/providers/me/reviews` → `200` — every review written about the caller, newest first, each including `customer` (`{ firstName, lastName }` only — no email) and `booking` (with `listing`).

**GET** `/api/listings/:listingId/reviews` — no auth required. Every review tied to a booking of that listing, newest first, each including `customer` (`{ firstName, lastName }`). `404 { "error": "Listing not found" }` if it doesn't exist or is inactive.

### Provider reply

Beyond the SRS's literal FR16 wording (customers rate/review/upload images), the `Review` model already carried a `providerReply` field, so a provider can reply once to a review on their own booking (added per direct request):

**PATCH** `/api/providers/me/reviews/:reviewId/reply`:
```json
{ "reply": "Thanks for the feedback, we're working on it!" }
```
Response `200`: the updated `Review` with `providerReply`/`providerRepliedAt` set. Errors: `404 { "error": "Review not found" }` if it doesn't exist or isn't about one of your bookings; `409 { "error": "This review already has a reply" }` — like the review itself, a reply is a one-time, immutable action.

### Rating aggregate in listing browsing/search (FR9 tie-in)

Now that reviews exist, every `providerProfile` object embedded in `GET /api/listings`, `GET /api/listings/:listingId`, and `POST /api/listings/ai-search` results carries a computed `averageRating` (rounded to 1 decimal, `null` if the provider has no reviews yet) and `reviewCount`. This is computed fresh per request via a batched `groupBy` (no N+1 queries, no stored/cached column to go stale).

A new `minRating` query param on `GET /api/listings` (and therefore also usable by AI search's underlying query) filters to providers whose `averageRating` is at least that value (`1`–`5`); providers with no reviews yet are excluded by any `minRating` filter. AI search's `matchReasons` now also includes `"Highly rated (X★ from N reviews)"` when a result's provider has `averageRating >= 4`.

**Not yet implemented / known limitations** (documented honestly): rating still isn't used as a *sort* key (only as a filter and a match-reason flag) — the default sort stays newest-first (or distance, when searching by location). Review moderation/reporting is a separate feature (FR18) and doesn't exist yet.

---

## Service Documentation (FR17)

Proof-of-work photos for a booking. The SRS's literal text is: customer before images, provider completion images, and *optional* after images. **Per direct request, "after" images were made mandatory too** — so completing a booking now requires both a `COMPLETION` and an `AFTER` image to already exist (see the completion gate on `PATCH .../bookings/:bookingId/complete` above). "Before" images are not gated on anything — the SRS never called them optional, but nothing in the booking lifecycle naturally blocks on them either, so they remain a customer-side courtesy rather than a hard requirement.

**Per-listing opt-out**: some service types have nothing visual to document (e.g. a delivery service) — per direct follow-up request, `ServiceListing.requiresDocumentation` (default `true`, settable on create/update — see FR6 above) controls whether the completion gate applies at all. When `false`, `PATCH .../bookings/:bookingId/complete` skips the documentation check entirely for bookings of that listing — no `COMPLETION`/`AFTER` images are needed.

Each `ServiceDocumentation` row is one image: `kind` (`"BEFORE" | "COMPLETION" | "AFTER"`), `imageUrl`, `uploadedById` (the `User.id` who added it), `createdAt`. Multiple images per kind are allowed (no uniqueness constraint) — the SRS says "images", plural.

**POST** `/api/customers/me/bookings/:bookingId/documentation`:
```json
{ "imageUrl": "https://example.com/before.jpg" }
```
Always creates a `BEFORE`-kind row (customers can't submit any other kind). Booking must be `ACCEPTED` or `IN_PROGRESS` — `409` otherwise (a customer can't retroactively document a job that's already `COMPLETED`/`CANCELLED`, nor one that hasn't been accepted yet). `imageUrl` must already be a real URL — upload first via `POST /api/uploads`. Response `201`: the created `ServiceDocumentation`.

**POST** `/api/providers/me/bookings/:bookingId/documentation`:
```json
{ "kind": "COMPLETION", "imageUrl": "https://example.com/completion.jpg" }
```
`kind` is `"COMPLETION"` or `"AFTER"` (providers can't submit `"BEFORE"`). Booking must be `IN_PROGRESS` — by construction, this means both required images have to be added *before* calling the `complete` action, not after. `409` otherwise. Response `201`.

**GET** `/api/customers/me/bookings/:bookingId/documentation` or **GET** `/api/providers/me/bookings/:bookingId/documentation` → `200` — every documentation row for that booking (all kinds), oldest first. Both endpoints work identically once ownership is confirmed.

All four endpoints: `404 { "error": "Booking not found" }` if it doesn't exist or isn't yours; `400 { "error": "Validation failed", ... }` for a missing/invalid `imageUrl` or an invalid `kind`.

**Not yet implemented / known limitations** (documented honestly): no notification kind for documentation events (FR15's SRS-listed notification categories — Bookings/Messages/Payments/Reviews/Verification/Promotions/Disputes — don't include Documentation, so none was added, to avoid scope drift beyond FR15's defined list). No deletion/replacement of a submitted image.

---

## AI Image Analysis (FR20)

Vision-based AI, distinct from every other AI feature in this backend (FR7, FR10, FR19) which sends **text only** to Groq. This uses a separate, vision-capable model (`GROQ_VISION_MODEL` in `.env`, defaults to `qwen/qwen3.6-27b` — override to whatever your account/tier supports; see the note below on model availability). All four capabilities are provider/customer-facing endpoints, not automatic, **except** suspicious-upload detection, which runs automatically (per direct request).

### Category prediction from an image

**POST** `/api/providers/me/listings/recommend-category-from-image`:
```json
{ "imageUrl": "https://example.com/job-photo.jpg" }
```
Visual counterpart to FR7's text-based `recommend-category` — same response shape (`category`, `confidence`, `reasoning`), same hallucination guard (the returned category id must be one of the real ones). Advisory only.

### Detect service objects

**POST** `/api/providers/me/listings/analyze-image`:
```json
{ "imageUrl": "https://example.com/job-photo.jpg" }
```
Response `200`: `{ "objects": ["pipe wrench", "ladder"], "description": "..." }`. Not tied to a specific listing — a general utility a provider can use on any image before deciding to attach it to a listing.

### Compare before/after

**POST** `/api/customers/me/bookings/:bookingId/documentation/compare` or **POST** `/api/providers/me/bookings/:bookingId/documentation/compare` — no body. Fetches that booking's earliest `BEFORE` and `AFTER` `ServiceDocumentation` rows (FR17) and asks the vision model whether the after photo plausibly shows real completed work at the same location/subject as the before photo. Response `200`:
```json
{ "verdict": "MATCH", "confidence": "high", "reasoning": "..." }
```
`verdict` is `"MATCH" | "MISMATCH" | "INCONCLUSIVE"`. Errors: `404` for unknown/not-yours booking; `409 { "error": "Both a BEFORE and an AFTER image are required to run a comparison" }` if either is missing yet (independent of whether the listing even `requiresDocumentation` — you can still run this once both images happen to exist).

### Detect suspicious uploads (automatic)

**Per direct request, this runs automatically** — not as an on-demand endpoint — whenever a new image is submitted via: `POST /api/providers/me/listings` / `PATCH .../listings/:listingId` (new images only, diffed against the previous set), `POST .../bookings/:bookingId/review` (FR16), or either documentation-submission endpoint (FR17). Each new image is sent to the vision model asking whether it looks fake, stolen/stock, or unrelated to any plausible home service. If flagged, a `Report` (FR18) is auto-filed with `targetType` matching the source (`LISTING`, `REVIEW`, or `DOCUMENTATION`), `reason: "INAPPROPRIATE_CONTENT"`, and **`reporterId: null`** (a system-filed report — see FR18's schema note), then every admin gets the usual `REPORT_FILED` notification.

This check is **best-effort and never blocks the underlying action**: if the vision call fails (bad model id, Groq outage, rate limit) the error is swallowed and the listing/review/documentation submission still succeeds normally — moderation coverage degrades gracefully rather than breaking the app. Admins action these system-filed reports exactly like user-filed ones (`WARN`/`SUSPEND`/`BAN`/`DISMISS` — see FR18); the action still resolves to the correct underlying user (the listing's provider, the review's author, or the documentation's uploader).

**Known limitations / practical notes** (documented honestly):
- **Model availability is external and account-dependent.** During development, the initially-guessed default vision model and two other well-known Groq vision model ids were all decommissioned/inaccessible on the test account — only `qwen/qwen3.6-27b` worked. There is no guarantee any specific model id stays available; if `GROQ_VISION_MODEL` stops working, every FR20 endpoint (and the automatic upload scan) starts returning/logging `502`-style "AI service unavailable" errors until it's repointed at a working model.
- **Image URLs must be fetchable by Groq's servers.** Some hosts (e.g. `upload.wikimedia.org`) return `403` to Groq's server-side image fetcher (bot/hotlink protection) even though the same URL loads fine in a browser — this isn't specific to this app, it's inherent to any `image_url`-based vision API call. Images uploaded via this app's own `POST /api/uploads` (Supabase Storage, public bucket) don't have this problem.
- Vision calls are noticeably slower and more rate-limited than the text-only calls elsewhere in this backend — the automatic upload scan adds real latency to listing/review/documentation submission (one Groq round-trip per new image).

---

## Reporting & Moderation (FR18)

Any authenticated user (customer **or** provider — reporting is bidirectional, per direct request) can file a report against a `USER`, `REVIEW`, `MESSAGE`, `LISTING`, or `DOCUMENTATION` (the last added alongside FR20's automatic flagging, below). Unlike Messaging/Disputes/Reschedule/Reviews/Documentation (all booking-scoped, exposed only via the customer/provider routers), a report isn't tied to a booking or a role, so this is the first module with its own genuinely role-agnostic top-level router — `/api/reports`, gated by `requireAuth` only (any role).

**POST** `/api/reports`:
```json
{
  "targetType": "USER",
  "targetId": "provider-or-customer-user-uuid",
  "reason": "SCAM_PROVIDER",
  "description": "Took payment offline and never showed up",
  "images": ["https://example.com/evidence.jpg"]
}
```
`targetType` is one of `"USER" | "REVIEW" | "MESSAGE" | "LISTING" | "DOCUMENTATION"`. `targetId` must reference a real row of that type — checked before creating the report (`404` otherwise). `reason` is one of the SRS's seven categories: `POOR_QUALITY | FRAUD | INAPPROPRIATE_BEHAVIOUR | FAKE_REVIEW | OFFENSIVE_MESSAGE | SCAM_PROVIDER | INAPPROPRIATE_CONTENT`. `description` and `images` are both optional. Response `201`: the created `Report` (`status: "PENDING"`). Filing a report notifies **every** `ADMIN`/`SUPER_ADMIN` (`REPORT_FILED`, FR15) — there's a moderation queue, but this pushes awareness immediately rather than relying on admins to poll it.

`reporterId` is **nullable** — a human-filed report always has one, but FR20's automatic suspicious-upload detection also files reports through this same table with `reporterId: null` (no human reporter). There's no separate "source" field — a `null` `reporterId` in the response **is** the tell that a report was system-filed rather than human-filed.

**GET** `/api/reports/mine` → `200` — every report the caller has filed, newest first.

### Admin moderation queue

**GET** `/api/admin/reports` — optional `?status=PENDING|REVIEWED|ACTIONED|DISMISSED`. Response `200`: matching reports, oldest first (oldest-first here, unlike most other admin lists, so the queue naturally works FIFO).

**GET** `/api/admin/reports/:reportId` → `200`, or `404` if it doesn't exist.

**PATCH** `/api/admin/reports/:reportId/review` — no body. `PENDING → REVIEWED`. `409` if not currently `PENDING`. This step is optional — an admin can go straight to `.../action` from `PENDING` too.

**PATCH** `/api/admin/reports/:reportId/action`:
```json
{ "action": "WARN", "resolutionNote": "First warning for reported scam behavior" }
```
`action` is one of `"WARN" | "SUSPEND" | "BAN" | "DISMISS"`. `resolutionNote` is optional freeform text (used as the notification content sent to the affected user, when applicable). `409` if the report has already been `ACTIONED`/`DISMISSED`.

For a non-`USER` target (`REVIEW`/`MESSAGE`/`LISTING`), the action resolves to and applies against the **underlying user** — a reported `Review`'s author, a reported `Message`'s sender, or a reported `Listing`'s owning provider — not the report's `targetId` directly. `409 { "error": "Cannot action this report — its target no longer exists" }` if that underlying target has since been deleted (WARN/SUSPEND/BAN only — `DISMISS` never needs to resolve a target).

What each action does:
| Action | Effect | Status → | Notification |
|---|---|---|---|
| `WARN` | Increments the target `User.warningCount` (new field, no automatic consequence yet — see limitations) | `ACTIONED` | `WARNING_ISSUED` |
| `SUSPEND` | `User.status → SUSPENDED` (same login-blocking behavior as FR12/FR13's suspensions; reversible via the existing `PATCH /api/admin/users/:userId/reactivate` from FR13) | `ACTIONED` | `ACCOUNT_SUSPENDED` |
| `BAN` | `User.status → BANNED` (blocks login with a **"banned"**-specific message — a real pre-existing bug was fixed here: `auth.service.ts` previously said "suspended" even for banned accounts) | `ACTIONED` | `ACCOUNT_BANNED` |
| `DISMISS` | No change to the target user at all | `DISMISSED` | none |

Every WARN/SUSPEND/BAN action also writes an `AuditLog` entry (`action: "REPORT_WARN" | "REPORT_SUSPEND" | "REPORT_BAN"`), same pattern as KYC review/admin management/reactivation.

### Admin notifications (FR15 gap fix)

Filing a report notifies all admins (see above) — but until this FR, `ADMIN`/`SUPER_ADMIN` had **no way to read their own notifications at all** (only the customer/provider routers exposed `.../me/notifications*`). Fixed by adding the identical four endpoints under `/api/admin`: `GET /api/admin/notifications`, `GET /api/admin/notifications/unread-count`, `PATCH /api/admin/notifications/read-all`, `PATCH /api/admin/notifications/:notificationId/read`.

**Not yet implemented / known limitations** (documented honestly): `warningCount` has no automatic consequence (unlike FR13's violation counter, which auto-suspends at 3) — an admin has to eyeball it and decide when to escalate to `SUSPEND`/`BAN` themselves. `BAN` has no dedicated unban endpoint — `PATCH /api/admin/users/:userId/reactivate` only lifts `SUSPENDED` (`409` on a `BANNED` account), so unbanning currently requires a direct DB update; this is intentional (a ban is meant to be a heavier, less casually-reversed action than a suspension) but worth knowing.

---

## Upload Module — `/api/uploads`

There are **two** upload endpoints backed by **two separate Supabase Storage buckets**, split by sensitivity:

| Endpoint | Bucket | Visibility | Used for |
|---|---|---|---|
| `POST /api/uploads` | `everyskill-uploads` | Public | Profile/cover images, gallery images, certification files |
| `POST /api/uploads/kyc` | `everyskill-kyc-private` | Private | KYC identity/business documents |

### Public Upload

**POST** `/api/uploads`
Header: `Authorization: Bearer <accessToken>` (any authenticated role — customer, provider, admin)
Body: `multipart/form-data` with a single field named `file`.

Example (curl):
```
curl -X POST http://localhost:4000/api/uploads \
  -H "Authorization: Bearer <accessToken>" \
  -F "file=@photo.jpg"
```

Response `201`:
```json
{ "url": "https://<project>.supabase.co/storage/v1/object/public/everyskill-uploads/<userId>/<uuid>.jpg" }
```
The `url` is permanent — use it directly in `profileImage`, `coverImage`, `galleryImages`, or certification `fileUrl`.

### Private KYC Upload

**POST** `/api/uploads/kyc` — **PROVIDER role only** (`403` for any other role)
Header: `Authorization: Bearer <accessToken>`
Body: same as above — `multipart/form-data` with a `file` field.

Response `201`:
```json
{ "path": "<userId>/<uuid>.jpg" }
```
Note this returns a storage **path**, not a URL — the file isn't publicly reachable. Pass this `path` as `documentPath` to `POST /api/providers/me/kyc`. To actually *view* the file afterward, use the signed-URL endpoints (`GET /api/providers/me/kyc/:kycId/document-url` or `GET /api/admin/kyc/:kycId/document-url`), which mint a fresh 10-minute link on each call — there is no permanent link to a KYC document anywhere in the system.

### Shared constraints (both endpoints)
- Allowed types: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`. Anything else → `400 { "error": "Unsupported file type. Allowed: JPEG, PNG, WebP, PDF." }`.
- Max size: 10MB. Larger → `400` with Multer's size-limit message.
- No file sent → `400 { "error": "No file provided (expected multipart/form-data field 'file')" }`.
- No/invalid token → `401`.

Requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `backend/.env` (see `.env.example`) — the service role key is server-side only and must never be shared with any client. Both buckets (`SUPABASE_STORAGE_BUCKET` and `SUPABASE_KYC_BUCKET`) are created automatically on server startup if they don't already exist.

---

## Token lifetimes (configurable via `backend/.env`)

| Token | Env var | Default |
|---|---|---|
| Access token | `JWT_ACCESS_EXPIRES_IN` | `15m` |
| Refresh token | `JWT_REFRESH_EXPIRES_IN` | `7d` |
| Password reset token | `JWT_RESET_EXPIRES_IN` | `1h` |

Access tokens carry `{ sub: userId, role }` and are required on any route using `requireAuth` (and optionally `requireRole(...)`) from `src/middleware/auth.ts`. Refresh tokens carry only `{ sub: userId }` and are never accepted as an `Authorization` header — only via `/api/auth/refresh`.

## Request logging

Every request is logged to the console (`src/middleware/requestLogger.ts`) as:
```
METHOD path statusCode durationMs [role:userId | anon]
```
e.g. `POST /api/auth/login 200 45ms [anon]` or `POST /api/auth/logout 204 12ms [CUSTOMER:3f2a...]`.
