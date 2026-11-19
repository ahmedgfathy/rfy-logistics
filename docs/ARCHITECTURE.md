# Architecture

```
Browser (Windows)
   │  http://localhost:5173
   ▼
┌──────────────────────────┐        /api/*  (vite proxy in dev, nginx in prod)
│  React + TS + Vite       │ ─────────────────────────────────────────────┐
│  Public site + /admin    │                                              │
└──────────────────────────┘                                              ▼
                                                   ┌──────────────────────────────┐
                                                   │  Express + TypeScript API    │
                                                   │  /api/v1  (helmet, cors,     │
                                                   │  rate limit, zod, JWT cookie)│
                                                   └──────────────┬───────────────┘
                                                                  │ Prisma
                                                                  ▼
                                                   ┌──────────────────────────────┐
                                                   │  PostgreSQL 16               │
                                                   │  users, quotes, contacts,    │
                                                   │  shipments + events, news,   │
                                                   │  services, audit logs        │
                                                   └──────────────────────────────┘
                                                                  │
                                                    uploads volume (private)
```

## Frontend

| Concern | Choice |
| --- | --- |
| Build | Vite 5, TypeScript strict |
| Routing | React Router 6 (`/` public, `/admin/*` lazy-loaded) |
| Data | TanStack Query (retries, caching, invalidation after mutations) |
| Forms | React Hook Form + Zod (schemas generated per language) |
| Styling | Tailwind 3 with design tokens in `src/index.css` |
| Motion | Framer Motion, used for scroll reveals only; respects `prefers-reduced-motion` |
| Icons | Lucide |
| i18n | i18next with `en` + `ar`, `dir` switched on `<html>`, logical CSS properties (`ps-`, `me-`, `start-`) throughout |

Public route map: `/`, `/about`, `/services`, `/services/:slug`, `/quote`, `/tracking`,
`/contact`, `/careers`, `/insights`, `/insights/:slug`, `/faq`, `/privacy`, `/terms`, `*`.

Admin route map: `/admin/login`, `/admin` (dashboard), `/admin/quotes`, `/admin/quotes/:id`,
`/admin/contacts`, `/admin/shipments`, `/admin/content`, `/admin/users` (ADMIN only).

## Backend

Layers: `routes` → `middleware` (validate / auth / rate limit / upload) → `controllers` →
`services` (audit, notification, tracking provider) → Prisma.

- **Errors**: one `ApiError` type, one handler; Prisma `P2002`/`P2025` mapped to 409/404;
  production responses never leak stack traces.
- **Validation**: Zod schemas in `src/validators/schemas.ts`; multipart fields are coerced
  (strings → numbers/dates) and rejected with 422 + field errors.
- **Versioning**: everything is mounted under `/api/v1`.
- **Health**: `GET /api/v1/health` probes `SELECT 1` and reports `degraded` (503) when the
  database is unreachable — used by both Docker healthchecks.

## Data model (Prisma)

`User` (role ADMIN|EDITOR) · `Permission` · `CompanySetting` · `Service` (bilingual body +
features) · `QuoteRequest` + `QuoteAttachment` · `ContactMessage` · `Shipment` +
`ShipmentEvent` · `NewsArticle` · `Testimonial` · `Partner` · `JobApplication` · `AuditLog`.

Design decisions:

- UUID primary keys; `slug`/`email`/`trackingNumber`/`reference` are unique.
- `QuoteAttachment.storedName` is unique; customer documents live in a private volume and are
  only streamed through an authenticated route.
- Composite indexes on the fields the dashboard filters on (`status + createdAt`).
- `Decimal` for weight/volume so freight figures are not float-rounded.
- `Shipment.isDemo` marks seeded records; the public UI discloses them explicitly.
- `Testimonial.isApproved` / `Partner.isApproved` default to `false`, so nothing unapproved
  can appear on the site.

## Tracking integration

`services/tracking/tracking.provider.ts` defines a `TrackingProvider` interface.

- `DatabaseTrackingProvider` (default) serves milestones recorded by operations.
- `HttpCarrierTrackingProvider` is selected automatically when `CARRIER_API_URL` and
  `CARRIER_API_KEY` are set. It expects `GET {url}/{trackingNumber}` returning
  `{ trackingNumber, status, mode, origin, destination, events[] }` — a mapping layer per
  carrier must be written before production use. Carrier failures return **503
  `TRACKING_UNAVAILABLE`**, never fabricated data.

## Notifications

`notifyAdmin()` writes a structured log line and, when `NOTIFY_WEBHOOK_URL` is configured,
POSTs the event. No email provider is wired in yet; the function is the single swap-in point.

## Docker

| Service | Dev target | Prod target |
| --- | --- | --- |
| postgres | port 5432 published | not published |
| backend | `tsx watch`, source bind-mounted, `migrate deploy`/`db push` + idempotent seed on boot | compiled `dist/`, non-root `node` user, healthcheck |
| frontend | Vite dev server with `/api` proxy | static build served by nginx, `/api` proxied to `backend:3000` |
| pgadmin | profile `tools`, port 5050 | — |
