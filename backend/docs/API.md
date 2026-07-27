# EverySkill Backend — API Documentation

Base URL (dev): `http://localhost:4000`

This document is updated as modules are built. Currently implemented: **Auth (FR1)**, **Customer Profile Management (FR2)**, **Provider Profile Management (FR3)**, **Provider Verification / KYC (FR4)**, **Service Listing Management (FR6)**, **AI Category Recommendation (FR7)**, **Availability & Schedule Management (FR8)**, **Search & Filtering (FR9)**, **AI Intelligent Search (FR10)**, **Administrator Management (FR24)**, and a generic **file upload endpoint** backing all of the above.

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
  "privacyPreferences": null
}
```

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

**GET** `/api/customers/me/bookings` → `200` — array of bookings (with `listing`, `providerProfile`, `payment` included), newest first.

**GET** `/api/customers/me/payments` → `200` — array of payments across all your bookings, newest first.

Both return `[]` for now — the booking/listing modules haven't been built yet, so nothing can populate these tables.

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
  "createdAt": "...",
  "updatedAt": "...",
  "email": "provider@example.com"
}
```
`verificationStatus` is read-only here — it's set by admins via KYC review (FR4), not by the provider.

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

**Current limitations** (documented honestly rather than silently no-op'd): ranking only orders by verification/recency/distance — semantic similarity, ratings, review count, response time, acceptance rate, and completed-jobs-based ranking are **not yet implemented**, since Reviews (FR16) and Bookings (FR11) don't exist yet to supply that data. Once those modules exist, this endpoint's ranking will incorporate them.

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

Note: this defines a provider's *declared* availability. Actual double-booking prevention against real bookings will be enforced once the Booking module (FR11) exists and checks a requested time against both these slots and other confirmed bookings.

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
