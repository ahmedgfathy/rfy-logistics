# API reference — `/api/v1`

All responses use an envelope: `{ "data": ... }`, with `{ "meta": { page, limit, total, pages } }`
on paginated lists. Errors: `{ "error": { "code", "message", "details?" } }`.

Authentication uses an **httpOnly cookie** (`marsa_session`) set by `/auth/login`.
`Authorization: Bearer <token>` is also accepted for non-browser clients.

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/health` | — | Service + database probe; 503 when the DB is down |
| POST | `/auth/login` | — | Sign in (rate-limited: 12 / 15 min) |
| POST | `/auth/logout` | — | Clear the session cookie (204) |
| GET | `/auth/me` | session | Current user |
| GET | `/services` | — | Active services, ordered |
| GET | `/services/:slug` | — | One service with full bilingual body |
| GET | `/news` | — | Published articles |
| GET | `/news/:slug` | — | One published article |
| GET | `/settings` | — | Public company settings key/value |
| GET | `/tracking/:trackingNumber` | — | Shipment snapshot + events (rate-limited) |
| POST | `/quotes` | — | Create a quote request (multipart, max 3 attachments) |
| GET | `/quotes` | session | List quotes (`?status=&search=&page=&limit=`) |
| GET | `/quotes/:id` | session | Quote detail + attachment metadata |
| PATCH | `/quotes/:id/status` | session | `{ status, adminNotes? }` |
| GET | `/quotes/:id/attachments/:attachmentId` | session | Stream a private document |
| POST | `/contact` | — | Contact message |
| GET | `/contact` | session | List messages (`?status=`) |
| PATCH | `/contact/:id/status` | session | `{ status }` |
| POST | `/careers/apply` | — | Job application (multipart, optional `cv`) |
| GET | `/careers` | session | List applications |
| PATCH | `/careers/:id/status` | session | `{ status }` |
| GET | `/admin/stats` | session | Dashboard counters, recent activity |
| GET | `/admin/shipments` | session | List shipments (`?search=`) |
| POST | `/admin/shipments` | session | Create a shipment record |
| GET | `/admin/shipments/:id` | session | Shipment + events |
| POST | `/admin/shipments/:id/events` | session | Append a milestone |
| GET | `/admin/services` | session | All services, including hidden |
| PATCH | `/admin/services/:id` | session | Update copy/visibility/position |
| GET | `/admin/news` | session | All articles, including drafts |
| POST | `/admin/news` | session | Create an article |
| PATCH | `/admin/news/:id` | session | Update / publish / unpublish |
| GET | `/admin/users` | ADMIN | List users |
| POST | `/admin/users` | ADMIN | Create an ADMIN or EDITOR |
| GET | `/admin/audit-logs` | ADMIN | Audit trail (paginated) |

## ERP endpoints

All ERP endpoints require a session and the relevant granular permission. Financial mutations,
period changes, reconciliation changes and quote conversion require an `Idempotency-Key` header
(8–128 characters). Reusing a key with a different payload returns `409 IDEMPOTENCY_CONFLICT`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/erp/dashboard` | Operational and financial overview |
| GET/POST | `/erp/partners` | List/create customers and vendors |
| GET/PATCH | `/erp/partners/:id` | Partner detail and maintenance |
| GET/POST | `/erp/quotes` | Commercial quote list/create |
| GET/PATCH | `/erp/quotes/:id` | Quote detail/update |
| POST | `/erp/quotes/:id/accept` | Accept a quote |
| POST | `/erp/quotes/:id/convert` | Idempotently convert to a booking/shipment |
| POST | `/erp/quotes/from-lead/:quoteRequestId` | Create a quote from a website lead |
| GET/POST | `/erp/bookings` | Booking list/create |
| GET | `/erp/bookings/:id` | Booking detail |
| PATCH | `/erp/bookings/:id/status` | Advance booking status |
| GET/POST | `/erp/shipments` | Operational shipment list/create |
| GET | `/erp/shipments/:id` | Shipment workspace detail |
| POST | `/erp/shipments/:id/events` | Append a milestone |
| POST | `/erp/shipments/:id/packages` | Add cargo package |
| POST | `/erp/shipments/:id/vendors` | Add vendor cost |
| PATCH | `/erp/shipments/:id/publication` | Control public tracking |
| GET/POST | `/erp/customs/files` | Customs file list/create |
| GET | `/erp/customs/files/:id` | Customs file detail |
| PATCH | `/erp/customs/files/:id/status` | Customs file transition |
| POST | `/erp/customs/files/:id/aci` | Record an ACI filing |
| PATCH | `/erp/customs/aci/:id` | ACI lifecycle update |
| GET/POST | `/erp/customs/declarations` | Declaration list/create |
| GET | `/erp/customs/declarations/:id` | Declaration detail |
| POST | `/erp/customs/declarations/:id/assess` | Assess duty/tax/fees |
| POST | `/erp/customs/declarations/:id/release` | Record payment and release |
| GET/POST | `/erp/customs/hs-codes` | HS reference lookup/create |
| GET/POST | `/erp/documents` | Document list/upload |
| GET | `/erp/documents/:id/download` | Authenticated private download |
| PATCH | `/erp/documents/:id/archive` | Archive a document |
| GET/POST | `/erp/tasks` | Task list/create |
| PATCH | `/erp/tasks/:id` | Task update |
| GET | `/erp/accounting/accounts` | Chart of accounts |
| GET | `/erp/accounting/journals` | Journals |
| GET | `/erp/accounting/journal-entries` | Ledger entries |
| POST | `/erp/accounting/journal-entries` | Post a balanced manual GENERAL/OPENING journal |
| GET | `/erp/accounting/journal-entries/:id` | Journal detail and reversals |
| POST | `/erp/accounting/journal-entries/:id/reverse` | Reverse an unreconciled manual journal |
| GET/PATCH | `/erp/accounting/fiscal-periods` | Period list/status change |
| GET/POST | `/erp/accounting/invoices` | Customer invoice list/create |
| GET | `/erp/accounting/invoices/:id` | Invoice detail |
| POST | `/erp/accounting/invoices/:id/issue` | Issue draft invoice |
| POST | `/erp/accounting/invoices/:id/post` | Post invoice to ledger |
| POST | `/erp/accounting/invoices/:id/void` | Reverse and void invoice |
| GET/POST | `/erp/accounting/bills` | Vendor bill list/create |
| GET | `/erp/accounting/bills/:id` | Bill detail |
| POST | `/erp/accounting/bills/:id/issue` | Issue draft bill |
| POST | `/erp/accounting/bills/:id/post` | Post bill to ledger |
| POST | `/erp/accounting/bills/:id/void` | Reverse and void bill |
| GET/POST | `/erp/accounting/payments` | Receipt/payment list/create |
| GET | `/erp/accounting/payments/:id` | Payment detail and allocations |
| POST | `/erp/accounting/payments/:id/post` | Post payment and allocations |
| POST | `/erp/accounting/payments/:id/void` | Reverse payment |
| GET/POST | `/erp/accounting/reconciliations` | Bank reconciliation list/create |
| POST | `/erp/accounting/reconciliations/:id/items/:itemId/match` | Match statement item |
| POST | `/erp/accounting/reconciliations/:id/items/:itemId/unmatch` | Unmatch statement item |
| POST | `/erp/accounting/reconciliations/:id/review` | Review reconciliation |
| POST | `/erp/accounting/reconciliations/:id/approve` | Approve reconciliation |
| GET | `/erp/accounting/reports/trial-balance` | Trial balance |
| GET | `/erp/accounting/reports/profit-and-loss` | Profit and loss |
| GET | `/erp/accounting/reports/receivables` | Receivables aging |
| GET | `/erp/accounting/reports/payables` | Payables aging |

Aliases `/periods`, `/bank-reconciliations`, `/chart-of-accounts` and `/reports/receivables`
remain available where implemented. Customs calculations are operational estimates, not legal
tariff advice, and the API does not submit data to ACI/Nafeza.

## Examples

### Create a quote request

```bash
curl -X POST http://localhost:3000/api/v1/quotes \
  -F fullName="Ahmed Hassan" \
  -F companyName="Nile Trading" \
  -F email="ahmed@example.com" \
  -F phone="+201000000000" \
  -F originCountry="China" -F originCity="Shanghai" \
  -F destinationCountry="Egypt" -F destinationCity="Alexandria" \
  -F shipmentType="FCL" -F freightMode="SEA" \
  -F cargoDescription="Household appliances, 420 cartons" \
  -F cargoWeightKg=12800 -F cargoVolumeCbm=54 \
  -F packageCount=420 -F containerType="40' HC" -F incoterms="FOB" \
  -F expectedShipDate="2026-12-01" \
  -F consent=true -F locale=en \
  -F attachments=@invoice.pdf
```

`201`

```json
{ "data": { "reference": "MSQ-2026-7KQ4", "status": "NEW", "createdAt": "...", "attachments": 1 } }
```

Validation failures return `422` with `details` keyed by field:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Please check the highlighted fields",
             "details": { "email": ["A valid email is required"] } } }
```

### Track a shipment

```bash
curl http://localhost:3000/api/v1/tracking/DEMO-SEA-1001
```

```json
{ "data": {
  "trackingNumber": "DEMO-SEA-1001", "status": "IN_TRANSIT", "mode": "SEA",
  "originPort": "Shanghai, CN", "destinationPort": "Alexandria, EG",
  "etd": "2026-11-02T00:00:00.000Z", "eta": "2026-12-04T00:00:00.000Z",
  "isDemo": true, "provider": "database",
  "events": [ { "status": "IN_TRANSIT", "location": "Suez Canal anchorage",
                "description": "Vessel waiting for canal transit slot",
                "occurredAt": "2026-11-16T06:15:00.000Z" } ] } }
```

Unknown number: `404 {"error":{"code":"NOT_FOUND", ...}}`. Carrier misconfiguration or
provider failure: `503 {"error":{"code":"TRACKING_UNAVAILABLE", ...}}`.

### Sign in and list quotes

```bash
curl -c cookies.txt -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@marsa-demo.local","password":"ChangeMe!2026"}'

curl -b cookies.txt 'http://localhost:3000/api/v1/quotes?status=NEW&page=1&limit=20'
```

## Status codes

`200` ok · `201` created · `204` no content · `400` bad request · `401` unauthenticated ·
`403` forbidden (role or foreign origin) · `404` not found · `409` conflict ·
`413` file too large · `422` validation error · `429` rate limited · `503` dependency down.

## Rate limits

| Scope | Limit |
| --- | --- |
| All API traffic | 600 requests / 15 min / IP |
| Login | 12 requests / 15 min / IP |
| Quote / contact / application submissions | 12 requests / hour / IP |
| Tracking lookups | 60 requests / 10 min / IP |

Set `RATE_LIMIT_DISABLED=true` only for local load testing.
