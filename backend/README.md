# EverySkill Backend

Node.js + Express + TypeScript API, using Prisma against PostgreSQL (Supabase).

## Setup

1. Copy `.env.example` to `.env` and fill in `DATABASE_URL` (a Postgres connection
   string) and JWT secrets.
2. Install dependencies:
   ```
   npm install
   ```
3. Generate the Prisma client and run the initial migration:
   ```
   npm run prisma:generate
   npm run prisma:migrate
   ```
4. Start the dev server:
   ```
   npm run dev
   ```
   The API listens on `http://localhost:4000` by default. `GET /health` returns
   `{ "status": "ok" }` once it's up.

## Project layout

```
src/
  config/       env loading, Prisma client
  middleware/   JWT auth (requireAuth/requireRole), central error handler
  modules/      one folder per feature area (auth is the first; more land per FR)
  utils/        AppError, asyncHandler
  app.ts        Express app wiring (middleware + routers)
  server.ts     process entrypoint
prisma/
  schema.prisma full data model for all SRS entities
```

## Auth (FR1)

- `POST /api/auth/register` — `{ email, password, role: CUSTOMER|PROVIDER, ... }`
- `POST /api/auth/login` — `{ email, password }`
- `POST /api/auth/refresh` — `{ refreshToken }`
- `POST /api/auth/logout` — requires `Authorization: Bearer <accessToken>`

Access tokens are short-lived JWTs; refresh tokens are long-lived JWTs whose
hash is stored on the user row so they can be revoked on logout. Google OAuth
login is stubbed out in the SRS (FR1) but not yet implemented — `googleId` is
already on the `User` model for when that's added.
