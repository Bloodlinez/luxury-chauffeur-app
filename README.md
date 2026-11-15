# Aurelia Chauffeur

A luxury chauffeur booking application with a React/Vite client and an Express API.

## Current functionality

- Airport and vehicle catalog backed by PostgreSQL when configured
- New Jersey airport pickup and NJ/NY/PA destination validation on the API
- Registration with bcrypt password hashing and database-backed accounts
- JWT sessions stored in HttpOnly, SameSite cookies
- Authenticated customer reservations and admin-only operations endpoints
- Server-generated reservation quotes; checkout amounts are read from the reservation
- PostgreSQL schema and idempotent seed data in `server/migrations`

Customers can complete a multi-step airport booking flow with server-generated quotes, future pickup validation, and a reservation-received confirmation that preserves pending status. The customer dashboard shows live upcoming and past reservations from PostgreSQL. Forms across login, booking, contact, partner onboarding, and fleet management use red inline field validation instead of browser alerts.

Partner onboarding is invitation-only: administrators issue expiring single-use tokens, invited companies create partner accounts, and admins approve, activate, or suspend partners. Active partners manage company profiles plus chauffeur and vehicle records for the three customer-facing categories (Business Class, First Class, Luxury SUV). Infiniti QX80 is rejected as a vehicle model. Partner and chauffeur trip portals use database-backed assignments and status transitions. Payment completion, notifications, flight monitoring, and production deployment are still incomplete. The application is not production-ready until those workflows and deployment checks are completed.

## Local setup

1. Install dependencies with `npm install`.
2. Create a PostgreSQL database, then copy `.env.example` to `.env` and set `DATABASE_URL`, a strong `JWT_SECRET`, and `CLIENT_URL` to the browser origin. Set `DATABASE_SSL=true` for a hosted PostgreSQL service that requires TLS.
3. Optionally set a Stripe test secret key as `STRIPE_SECRET_KEY` to enable Stripe Checkout test mode.
4. Run `npm run dev`. The API applies the SQL files in `server/migrations` before listening; Vite is available at http://localhost:5173.

The API intentionally refuses to start without `DATABASE_URL` outside the test runner. No demo user accounts or default production credentials are created.

## Commands

- `npm run dev` starts the API and Vite client.
- `npm run build` creates the frontend production bundle.
- `npm test` runs security tests and starts a real embedded PostgreSQL instance for migrations, persistence, assignment, and trip-status integration tests.

## API security

Customer endpoints require a valid session. Admin endpoints also require an account whose current database role is `admin`; new public registrations are always customers, so admin accounts must be provisioned by an authorized database operator. The web client uses an HttpOnly session cookie. Never commit `.env` or real provider credentials.