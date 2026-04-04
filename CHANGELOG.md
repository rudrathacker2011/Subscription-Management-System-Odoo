# Changelog

## [2.0.0] - Revora Rebranding & Workflow Engine Update

### Added
- **Multi-step Approval Workflow**: Implemented a comprehensive approval funnel for subscriptions (`PORTAL REQUEST` -> `ADMIN APPROVAL` -> `STAFF APPROVAL` -> `ACTIVE`).
- **Centralized Email System**: Added `services/email.js` using a robust transporter with automatic retries and modular email templates for password reset, renewals, overdue bills, and subscription workflows.
- **Notification Engine**: New `Notification` model and `routes/notifications.js` to handle real-time in-app dashboard alerts.
- **Revora Design System**: Complete global UI/UX redesign using Royal Purple (`#7C3AED`) and Gold (`#F59E0B`). Added responsive layouts, modern sidebar, and glassmorphism UI elements.
- **Portal Catalog**: Added `catalog.html` for portal users to browse and request goods and services.
- **Approval Dashboards**: `pending-approval.html` (Admin) and `staff-approval.html` (Staff) introduced.

### Changed
- Rebranded to "Revora".
- Replaced all inline `nodemailer` snippets across `auth.js`, `invoices.js`, and `cron.js` to utilize the new centralized service.
- Fixed `routes/admin.js` to utilize the common Prisma instance rather than spawning new clients, resolving connection pooling issues.
- Fixed `routes/catalog.js` by targeting the fully correct `prisma.recurringPlan` model.
- Restructured `package.json` to include modern scripts (`dev`, `start`, `db:push`, `db:generate`, `seed`).

### Fixed
- Password reset emails failing to send.
- Recurring renewal cron triggers sending blank alerts.
- Memory leak and excessive client crashes due to non-shared Prisma clients.
- Rate limiter middleware sequence blocking essential routes in `server.js`.
