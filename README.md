# RFY Logistics — corporate website & operations dashboard

A full-stack freight forwarding website for an Egyptian forwarder and customs broker:
public marketing site (EN/AR, RTL), quotation workflow, shipment tracking, private admin
dashboard, Express API, PostgreSQL database, all running in Docker Compose.

> **Brand note:** the company name is **RFY** (shown as *RFY Logistics / RFY للخدمات اللوجستية*).
> The palette, the logo mark and every contact detail remain **placeholder** items created for
> this build and must be replaced with the client’s verified information before launch — see
> `docs/CONTENT_TODO.md`. Internal identifiers (Docker project `marsa-logistics`, container
> names, database `marsa_logistics`, cookie `marsa_session`) still use the original working
> name so existing volumes and sessions keep working; they are not user-facing. The client confirmed the business model: a freight forwarder and
> customs clearance company handling all shipping modes, with **no owned fleet or warehouses**.

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, TypeScript, Vite 5, React Router 6, TanStack Query, Tailwind CSS, Framer Motion, Lucide, React Hook Form + Zod, i18next (en/ar) |
| Backend | Node.js 20, Express 4, TypeScript, Prisma 5, PostgreSQL 16, Zod, JWT (httpOnly cookie), helmet, express-rate-limit, multer |
| Infra | Docker Compose (dev + prod), nginx for the production frontend, named volumes for data and uploads |

## Requirements

- Docker Desktop with Compose v2 (verified here with Docker 29.9 / Compose v5.7)
- Ports free: `5173`, `3000`, `5432`, optionally `5050`

## Quick start

```bash
cp .env.example .env      # then edit secrets for anything beyond local development
docker compose up --build -d
```

| URL | What |
| --- | --- |
| http://localhost:5173 | Public website |
| http://localhost:5173/admin/login | Operations dashboard |
| http://localhost:3000/api/v1/health | API health probe (returns DB status) |
| localhost:5432 | PostgreSQL (`marsa` / value of `POSTGRES_PASSWORD`) |
| http://localhost:5050 | pgAdmin — only with `docker compose --profile tools up -d` |

Seeded administrator (from `.env`):

```
email:    admin@marsa-demo.local
password: ChangeMe!2026
```

**Change these before any shared or public deployment.**

First boot automatically waits for PostgreSQL, applies the schema, seeds the administrator,
the nine-service catalogue, company settings, and three clearly labelled demonstration
shipments (`DEMO-SEA-1001`, `DEMO-AIR-1002`, `DEMO-ROAD-1003`).

## Everyday commands

```bash
docker compose ps                        # container health
docker compose logs -f backend           # API logs (includes admin notifications)
docker compose logs -f frontend          # Vite logs
docker compose exec backend npx prisma migrate dev --name <name>   # create a migration
docker compose exec backend npx prisma studio                      # inspect data
docker compose exec postgres psql -U marsa -d marsa_logistics      # SQL shell
docker compose --profile tools up -d     # start pgAdmin
docker compose down                      # stop (data kept in named volumes)
docker compose down -v                   # stop and DELETE database + uploads volumes
```

Hot reload: backend runs `tsx watch`, frontend runs the Vite dev server with polling enabled
for Windows bind mounts. Both mount source from the host, so edits apply immediately.

## Production-like stack

```bash
# copy .env.example to .env.production, set strong values, then:
docker compose --env-file .env.production -f docker-compose.prod.yml up --build -d
```

- Postgres is **not** published to the host.
- Backend builds to `dist/` and runs as the non-root `node` user.
- Frontend is a static build served by nginx with `/api` proxied to the backend.
- Set `SEED_DEMO_DATA=false`; set `CORS_ORIGIN` and `PUBLIC_SITE_URL` to the real origin;
  terminate TLS in front of the frontend.
- After the first deploy: change the seeded admin password and set
  `ADMIN_PASSWORD` only for the initial seed (it is not re-applied to an existing user).

Default production port: `http://localhost:8080` (`APP_PORT`).

## Deploy to Vercel

The same repository deploys as a single Vercel project (static Vite site +
Express API function) backed by Neon Postgres and Vercel Blob. See
[`docs/VERCEL_DEPLOYMENT.md`](docs/VERCEL_DEPLOYMENT.md) for the full setup,
environment variables, schema migration and verification checklist.

## Project layout

```
backend/
  prisma/schema.prisma        # data model
  src/config|controllers|middleware|routes|services|validators|db
  docker-entrypoint.sh        # wait for DB → migrate → seed → start
frontend/
  src/components/{layout,sections,forms,tracking,ui,admin}
  src/pages/                  # public pages
  src/pages/admin/            # dashboard (lazy-loaded)
  src/i18n/{en,ar}.ts         # all site copy
  src/lib/{api,seo,queries,site,form-schemas}.ts
docker-compose.yml            # development
docker-compose.prod.yml       # production-like
vercel.json                   # Vercel build / rewrite configuration
api/[...path].ts              # Express API as a Vercel Function
docs/                         # research, architecture, API, security, content checklist
```

## Features

- **Public site:** cinematic hero with tracking entry, services overview, why-us, gateway
  coverage, industries, 4-step process, insights, CTA, corporate footer.
- **Services:** nine service pages driven by the database (bilingual body + feature lists),
  each with its own copy, pathway and CTA.
- **Quote request:** three-step form (contact → shipment → requirements), 20+ fields,
  up to three validated attachments, saved to PostgreSQL, reference returned to the client,
  administrator notified.
- **Tracking:** tracking number lookup with status, route, dates, weights and a milestone
  timeline. Demo records are disclosed as demonstration data.
- **Contact / careers:** stored submissions with CV upload for applications.
- **Admin:** dashboard statistics, quote workflow with seven statuses and internal notes,
  message inbox, shipment records with milestone creation, news drafting/publishing,
  service copy and visibility editing, user provisioning, audit log endpoint.
- **Bilingual:** English and Arabic with correct RTL, logical spacing utilities and
  Arabic typography (IBM Plex Sans Arabic); content stored per language in the database.
- **Theme:** dark-only corporate interface (charcoal + orange, Cairo typography) shared by
  the public site and admin dashboard, inspired by the Egypt Ship visual language.
- **SEO:** per-page titles/descriptions, canonical URLs, Open Graph/Twitter tags, JSON-LD
  (Organization, Service, Breadcrumb, FAQ, Article), `robots.txt`, `sitemap.xml`.
- **Security:** Argon2-class cost via bcrypt(12), httpOnly + SameSite cookies, origin guard
  on mutations, strict CORS allowlist, rate limits per route class, upload type/size limits,
  private document storage, audit logging, no secrets in code.

## Documentation

- `docs/VERCEL_DEPLOYMENT.md` — Vercel + Neon + Blob production deployment
- `docs/ARCHITECTURE.md` — system design, data model, tracking integration
- `docs/API.md` — endpoints, payloads, status codes
- `docs/SECURITY.md` — implemented controls and remaining items
- `docs/TESTING.md` — what was executed and what remains unverified
- `docs/COMPETITOR_RESEARCH.md` — reference analysis
- `docs/CONTENT_TODO.md` — placeholder content that must be replaced

## Known limitations

- **No email provider is connected.** Submissions are stored and the admin notification is
  emitted as a structured log line / optional webhook (`NOTIFY_WEBHOOK_URL`).
- **No live carrier API.** Tracking reads operationally recorded milestones; the provider
  interface is in place for a real integration.
- **No automated test suite.** Verification performed for this build is documented in
  `docs/TESTING.md`; there are no unit or end-to-end tests yet.
- **Arabic translation** covers all site copy, but should be reviewed by the client’s own
  Arabic copywriter for trade terminology.
- Placeholder contact details, no testimonials, no partner logos, no company statistics.
