# EverySkill Backend — API Documentation

Base URL (dev): `http://localhost:4000`

This document is updated as modules are built. Currently implemented: **Auth (FR1)**, **Customer Profile Management (FR2)**, **Provider Profile Management (FR3)**, **Provider Verification / KYC (FR4)**, **Service Listing Management (FR6)**, **AI Category Recommendation (FR7)**, **Availability & Schedule Management (FR8)**, **Search & Filtering (FR9)**, **AI Intelligent Search (FR10)**, **Booking Management (FR11)**, **Escrow Payment System (FR12)** (extended with provider balances/withdrawals, platform commission, offline payments, and mid-job extra charges — beyond the original SRS wording, added per direct request), **Cancellation & Dispute Resolution (FR13)** (extended with a reschedule alternative to late cancellation, and a violation-count/auto-suspension "standing" mechanic — also beyond the original SRS wording, per direct request), **In-App Messaging (FR14)**, **Administrator Management (FR24)**, and a generic **file upload endpoint** backing all of the above.

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
  "cancellationCutoffHours": 24
}
```
`categoryIds` (non-empty array), `title`, `description`, `price`, `durationMinutes` required. `pricingType` is `"FIXED"` (price for the whole task) or `"HOURLY"` (price per hour) — defaults to `"FIXED"` if omitted. `price` means "total price for the task" under `FIXED`, or "rate per hour" under `HOURLY`; `durationMinutes` is always the estimated/scheduled duration (used for booking slots either way). `images`, `tags` default to `[]`; `cancellationCutoffHours` defaults to `24` (see FR13 — this is the cutoff, relative to the booking time, after which a customer cancellation or no-show gets recorded against the responsible party). Response `201`, with the created listing's `categories` array populated. Errors: `404 { "error": "One or more categories not found" }`.

### Update a listing

**PATCH** `/api/providers/me/listings/:listingId` — any subset of the create fields, plus `isActive: false` to unpublish (hide from public search) without deleting it. Passing `categoryIds` **replaces** the full set of categories (not a merge) — it must still be non-empty. Response `200`. Errors: `404` for unknown/not-yours listing, or `404 { "error": "One or more categories not found" }`.

### Delete a listing

**DELETE** `/api/providers/me/listings/:listingId` → `204`. Errors: `404 { "error": "Listing not found" }`.

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

**Current limitations** (documented honestly rather than silently no-op'd): ranking only orders by verification/recency/distance — semantic similarity, ratings, review count, response time, acceptance rate, and completed-jobs-based ranking are **not yet implemented**, since Reviews (FR16) don't exist yet to supply that data, and Bookings (FR11, now built) don't yet track response time/acceptance rate/completed-jobs counts. Once those exist, this endpoint's ranking will incorporate them.

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

**PATCH** `/api/providers/me/bookings/:bookingId/complete` — no body → `IN_PROGRESS → COMPLETED`. Response `200`.

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
