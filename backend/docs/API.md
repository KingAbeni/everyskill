# EverySkill Backend — API Documentation

Base URL (dev): `http://localhost:4000`

This document is updated as modules are built. Currently implemented: **Auth (FR1)**.

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

Only a bare `ProviderProfile` (type + display name) is created on registration — the rest of FR3's provider fields (description, skills, service area, certifications, gallery, operating hours, etc.) aren't settable yet; that's the next module to build.

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
| `401` | `{ "error": "Invalid email or password" }` | Wrong email or wrong password |

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
