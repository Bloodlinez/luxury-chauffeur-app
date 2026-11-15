# Aurelia Chauffeur remaining implementation checklist

## Phase 1 - Security and persistent architecture
- [x] Audit the demo auth and in-memory reservation flow
- [x] Replace plaintext password handling with bcrypt hashing and JWT sessions
- [x] Add server-side route validation and authorization checks
- [x] Replace user and reservation demo storage with PostgreSQL-backed records
- [x] Add unit and real-PostgreSQL regression tests for auth, persistence, assignment, and trip status
- [x] Provide environment variables and local setup docs for PostgreSQL and Stripe test credentials
- [x] Wire frontend requests to protected endpoints using HttpOnly sessions

## Phase 2 - Product completion
- [ ] Replace static marketing pages with a luxury editorial sales site
- [ ] Complete legal and service page content admin configuration
- [x] Build complete customer account and dashboard workflows
- [x] Implement multi-step reservation flow with real server quotes and statuses
- [x] Add inline field-level form validation across customer, partner, and admin forms
- [x] Support From Airport / To Airport transfers with street-address service-area validation
- [x] Fix dark select menus, passenger/luggage steppers, and capacity enforcement
- [x] Replace incorrect fleet photography with category placeholders ready for final assets
- [x] Differentiate Business Class, First Class, and Luxury SUV fleet card presentation
- [x] Build database-backed partner and chauffeur trip portals with status transitions
- [x] Add transactional admin chauffeur assignment to persisted reservations
- [x] Add partner invitations, partner roster, and vehicle/fleet management
- [x] Add remaining admin management and fleet controls
- [ ] Add Stripe sandbox checkout, dispatch, notifications, and flight monitoring hooks
- [ ] Add maps, routing, and status tracking integrations
- [ ] Add proper reporting, audit logs, and role-specific access controls

## Phase 3 - Quality and deployment
- [x] Run frontend build and backend tests for implemented security and dispatch flows
- [x] Test partner invitation, partner fleet isolation, and admin partner controls
- [x] Test remaining customer account and booking validation workflows
- [ ] Add final luxury fleet photography assets under `public/fleet/`
- [ ] Configure address autocomplete provider token for live suggestions
- [ ] Add deployment configuration for preview and production hosting
- [ ] Verify no secrets or credential material are committed
