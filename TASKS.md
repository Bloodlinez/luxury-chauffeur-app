# Aurelia Chauffeur remaining implementation checklist

## Phase 1 - Security and persistent architecture
- [x] Audit the demo auth and in-memory reservation flow
- [x] Replace plaintext password handling with bcrypt hashing and JWT sessions
- [x] Add server-side route validation and authorization checks
- [x] Replace user and reservation demo storage with PostgreSQL-backed records
- [x] Add automated regression tests for forbidden routes and secure reservation creation
- [x] Provide environment variables and local setup docs for PostgreSQL and Stripe test credentials
- [x] Wire frontend requests to protected endpoints using HttpOnly sessions

## Phase 2 - Product completion
- [ ] Replace static marketing pages with a luxury editorial sales site
- [ ] Complete legal and service page content admin configuration
- [ ] Build complete customer account and dashboard workflows
- [ ] Implement multi-step reservation flow with real server quotes and statuses
- [ ] Add partner and chauffeur operational portals with DB-backed records
- [ ] Add admin management, fleet, and assignment controls
- [ ] Add Stripe sandbox checkout, dispatch, notifications, and flight monitoring hooks
- [ ] Add maps, routing, and status tracking integrations
- [ ] Add proper reporting, audit logs, and role-specific access controls

## Phase 3 - Quality and deployment
- [ ] Run frontend and backend validation on all critical flows
- [ ] Test customer booking, admin assignment, partner invitation, and chauffeur updates
- [ ] Add deployment configuration for preview and production hosting
- [ ] Verify no secrets or credential material are committed
