# EverySkill Backend — API Documentation

Base URL (dev): `http://localhost:4000`

This document is updated as modules are built. Currently implemented: **Auth (FR1)**, **Customer Profile Management (FR2)**, **Provider Profile Management (FR3)**.

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
`profileImage`, `coverImage`, `website`, and each entry in `galleryImages` must be valid URLs. `socialLinks`, `portfolioLinks`, and `operatingHours` accept any JSON object shape. Response `200`: the updated `ProviderProfile` row.

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
