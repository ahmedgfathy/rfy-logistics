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

Admin route map: `/admin/login`, `/admin` (website dashboard), `/admin/erp`,
`/admin/erp/partners`, `/admin/erp/quotes`, `/admin/erp/bookings`, `/admin/erp/shipments`,
`/admin/erp/customs`, `/admin/erp/documents`, `/admin/erp/tasks`, `/admin/erp/invoices`,
`/admin/erp/bills`, `/admin/erp/payments`, `/admin/erp/accounting`, plus the original website
quote, contact, shipment, content and user-administration screens.

## Backend

Layers: `routes` → `middleware` (validate / auth / rate limit / upload) → `controllers` →
`services` (audit, notification, tracking provider) → Prisma.

- **Errors**: one `ApiError` type, one handler; Prisma `P2002`/`P2025` mapped to 409/404;
  production responses never leak stack traces.
- **Validation**: Zod schemas in `src/validators/schemas.ts` and per-module `*.schemas.ts`;
  multipart fields are coerced (strings → numbers/dates) and rejected with 422 + field errors.
- **ERP modules**: `src/modules/{partners,sales,operations,customs,documents,tasks,accounting,dashboard}`
  are mounted below `/api/v1/erp`; shared money, numbering, idempotency, company and audit helpers
  keep module boundaries consistent.
- **Versioning**: everything is mounted under `/api/v1`.
- **Health**: `GET /api/v1/health` probes `SELECT 1` and reports `degraded` (503) when the
  database is unreachable — used by both Docker healthchecks.

## Data model (Prisma)

The original website models remain (`User`, `CompanySetting`, `Service`, `QuoteRequest`,
`ContactMessage`, `Shipment`, `ShipmentEvent`, `NewsArticle`, `Testimonial`, `Partner`,
`JobApplication`, `AuditLog`). The ERP adds `Company`, `Branch`, `BusinessPartner`, roles and
permissions, commercial `Quote`/`Booking`, cargo packages/containers/vendor costs, `Document`,
`Task`, `CustomsFile`/`AciFiling`/`CustomsDeclaration`, `Invoice`/`Bill`/`Payment`,
`Account`/`Journal`/`JournalEntry`, fiscal years/periods, bank reconciliation, number sequences
and idempotency records.

Design decisions:

- UUID primary keys; `slug`/`email`/`trackingNumber`/`reference` are unique.
- `QuoteAttachment.storedName` is unique; customer documents live in a private volume and are
  only streamed through an authenticated route.
- Composite indexes on the fields the dashboard filters on (`status + createdAt`).
- `Decimal` for weight/volume so freight figures are not float-rounded.
- `Shipment.isDemo` marks optional seeded records and defaults to `false`; the public UI discloses
  demo records explicitly.
- Financial amounts use `Decimal`; posted journals are immutable and voids create reversing entries.
  Manual postings are limited to GENERAL/OPENING journals; system-generated entries must be
  reversed through their source documents. Reconciled manual lines must be unmatched first.
- Company-level financial write serialization, row locks and idempotency keys prevent duplicate
  postings and make retries deterministic.
- ACI filings and customs declarations have separate lifecycles; declaration release requires
  full payment. No live Nafeza submission is implied.
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
| backend | `tsx watch`, source bind-mounted, `migrate deploy`; optional seed via `RUN_SEED=true` | compiled `dist/`, non-root `node` user, migration-aware entrypoint, healthcheck |
| frontend | Vite dev server with `/api` proxy | static build served by nginx, `/api` proxied to `backend:3000` |
| pgadmin | profile `tools`, port 5050 | — |
