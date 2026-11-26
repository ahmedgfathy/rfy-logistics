# Deploying RFY Logistics to Vercel + PostgreSQL

Pick **one** of these topologies. Do not mix them.

| | Option A — one project (recommended) | Option B — two projects |
| --- | --- | --- |
| Root Directory | `.` (repository root) | `backend` and `frontend` respectively |
| Frontend | `frontend/dist` from the same project | separate static project |
| API | `api/[...path].ts` at repo root | `backend/api/[...path].ts` |
| Origin | same-origin `/api` | cross-origin, needs CORS + `SameSite=None` |

Option A is simpler because the admin session cookie and CORS need no extra
configuration. Option B works too; this repository now contains a `vercel.json`
in both `backend/` and `frontend/` so each project installs and builds
independently.

---

## 1. Create the PostgreSQL database

You can use Neon or Vercel's **Prisma Postgres** integration — both are plain
PostgreSQL from the app's point of view. Configure both runtime and migration
connections:

- **Neon:** enable connection pooling, use the **pooled** connection string for
  runtime queries (hostname contains `-pooler`), and use the **direct**
  connection string for `DIRECT_URL`.
- **Prisma Postgres:** the integration injects several variables. The backend
  automatically prefers `DATABASE_URL_POOLED` (host `pooled.db.prisma.io`) for
  runtime queries. Set `DIRECT_URL` explicitly to the direct PostgreSQL endpoint
  if the integration does not provide a usable one; the other injected variables
  (`DATABASE_URL`, `POSTGRES_URL`, `PRISMA_DATABASE_URL`) may point there.

`DIRECT_URL` is required because Prisma validates the schema with a
`directUrl` datasource during the build and uses it for migrations. Set
`DATABASE_URL` to a plain PostgreSQL string as well; never use a `prisma://...`
value. If runtime pooling is unavailable, use the direct URL for
`DATABASE_URL`, while keeping `DIRECT_URL` set.

---

## 2A. Option A — one Vercel project

1. Add New → Project and import `https://github.com/ahmedgfathy/rfy-logistics.git`.
2. Branch `main`, **Root Directory** `.` (repository root). Vercel often
   auto-selects `frontend`; change it under **Settings → General → Root Directory**.
3. Framework preset: **Other**. Settings come from the root `vercel.json`:
   - Install: `npm install && npm run install:all`
   - Build: `npm run build:all`
   - Output: `frontend/dist`
4. Set the environment variables from section 4 (use `VITE_API_BASE_URL=/api/v1`).
5. Deploy.

---

## 2B. Option B — two Vercel projects

### Backend project (the one throwing `Missing script: "install:all"`)

1. Import the same GitHub repo, branch `main`, **Root Directory = `backend`**.
2. **Settings → General → Build & Development Settings**: set
   - Install Command: `npm install`
   - Build Command: `npm run build`

   This clears the stale root-level `install:all` command that Vercel kept from
   the first import. `backend/vercel.json` declares the same values.
3. Add the backend environment variables from section 4.
4. Create/connect a **private Blob store** (section 3) and redeploy.
5. Deploy. The API will answer at `https://<backend-project>.vercel.app/api/v1/health`.

### Frontend project

1. Import the same repo, branch `main`, **Root Directory = `frontend`**.
2. Framework preset: **Vite**. `frontend/vercel.json` sets install
   (`npm install`), build (`npm run build`), output (`dist`) and the SPA rewrite.
3. Add the frontend environment variables from section 4 — especially
   `VITE_API_BASE_URL=https://<backend-project>.vercel.app/api/v1`.
4. Deploy.

> `VITE_*` values are compiled into the bundle, so **redeploy the frontend**
> after changing any of them.

---

## 3. Connect Vercel Blob (quote attachments, CVs, and ERP documents)

Vercel Functions have an ephemeral filesystem, so local disk uploads cannot be
used in production. Quote attachments, career CVs, and ERP document-vault files
all use the same private storage service.

1. In the **backend** project, open **Storage → Create Database → Blob**, choose
   **Private**, and connect it to Production (and Preview if needed). In the
   one-project topology, create it there too because that project runs the API.
2. The connection injects `BLOB_STORE_ID` + `VERCEL_OIDC_TOKEN`, which the SDK
   uses automatically. Alternatively enable **read-write token env var** for
   `BLOB_READ_WRITE_TOKEN`.
3. Redeploy so the function sees the new variables.

Production on Vercel fails closed without Blob credentials, including when
`STORAGE_DRIVER=local` is selected, because the function filesystem is not
durable. Local Docker development needs no Blob configuration: with
`STORAGE_DRIVER=local`, the app writes to `UPLOAD_DIR`. Never expose raw private
Blob URLs; authenticated API routes serve downloads.

---

## 4. Environment variables

### Backend project

| Variable | Example / notes |
| --- | --- |
| `DATABASE_URL` | required plain `postgres://...` connection string |
| `DATABASE_URL_POOLED` | preferred at runtime (injected by Prisma Postgres integration) |
| `DIRECT_URL` | **required** direct plain `postgres://...` URL for validation/migrations |
| `JWT_SECRET` | `openssl rand -hex 32` — at least 32 characters |
| `JWT_EXPIRES_IN` | `8h` |
| `NODE_ENV` | `production` |
| `CORS_ORIGIN` | **frontend** origin, e.g. `https://rfy.vercel.app` (comma-separate extras) |
| `PUBLIC_SITE_URL` | **frontend** origin |
| `UPLOAD_DIR` | `/tmp/uploads` (fallback only; Blob is used in production) |
| `STORAGE_DRIVER` | `auto`; Vercel requires Blob credentials and rejects local disk |
| `MAX_UPLOAD_MB` | `4` — stay under the Vercel request-body limit |
| `SEED_DEMO_DATA` | `false` in production |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | used by the one-time seed command |

In production the session cookie is set with `SameSite=None; Secure` so it is
sent on cross-origin requests from the frontend project. The frontend already
sends `credentials: 'include'`.

### Frontend project

| Variable | Option A | Option B |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `/api/v1` | `https://<backend-project>.vercel.app/api/v1` |
| `VITE_SITE_URL` | `https://<your-domain>` | `https://<frontend-project>.vercel.app` |

---

## 5. Apply the schema and create the admin user

New databases are empty. Run this once from a machine with Docker, using the
**same** `JWT_SECRET` as Vercel and the direct database connection:

```bash
docker run --rm \
  -v "C:/rfy/backend:/app" -w /app \
  -e DATABASE_URL="postgresql://direct-user:password@direct-host/db?sslmode=require" \
  -e DIRECT_URL="postgresql://direct-user:password@direct-host/db?sslmode=require" \
  -e JWT_SECRET="same-32-character-secret-as-vercel" \
  -e ADMIN_EMAIL="admin@your-domain.com" \
  -e ADMIN_PASSWORD="your-strong-password" \
  -e ADMIN_NAME="Operations Administrator" \
  -e SEED_DEMO_DATA="false" \
  node:24-bookworm \
  sh -c "npm install --no-audit --no-fund && npx prisma migrate deploy && npx prisma generate && npm run seed"
```

On Windows PowerShell use backticks (`` ` ``) for line continuations. On
macOS/Linux replace `C:/rfy/backend` with the absolute path to `backend`.

`migrate deploy` applies all migrations, including the original schema and
`backend/prisma/migrations/20261126000000_erp`. The idempotent seed creates the
administrator, bilingual service catalogue, RFY company/branch, permissions and
roles, chart of accounts, accounting journals/periods, tax/charge references,
number sequences, and HS reference codes. If the admin email already exists,
seed will **not** change its password — reset it in the database or use a new
email.

Do not use `prisma db push` in production. Docker startup also applies
migrations and seeds only when `RUN_SEED=true`; keep that disabled in a normal
production deployment after the one-time initialization.

---

## 6. Verify

- `GET <backend-origin>/api/v1/health` → `"database": "up"`.
- Public pages load directly by URL (`/services`, `/tracking`, `/quote`).
- EN/AR switch flips direction and translations.
- Quote with attachment → visible in admin quote detail; attachment downloads.
- Careers application with a CV is stored.
- `/admin/login` → dashboard sidebar visible; admin cookie survives a refresh.
- Authenticated ERP reads work at `/api/v1/erp/dashboard`,
  `/api/v1/erp/partners`, and `/api/v1/erp/customs/hs-codes`.
- `/admin/erp/accounting` opens without console errors; trial balance reports
  `balanced: true` and invoices, bills, receipts, and payments retain their
  state after refresh.
- A private ERP document upload downloads through its authenticated API route;
  no raw Blob URL is exposed.
- Finance workflow rejects posting into a locked fiscal period and rejects
  over-allocation of an invoice or bill.

---

## 7. GitHub CI/CD

### Continuous deployment (Vercel)

When Vercel projects are connected to `ahmedgfathy/rfy-logistics` on `main`,
**every push to `main` automatically deploys** — no extra GitHub Action is
needed. With two projects, each project only deploys when changes land in its own
Root Directory (`backend/` or `frontend/`); root-level shared configuration or
API changes may require a redeploy of both projects. The one-project topology
deploys the complete application together.

| Project | Root Directory | Install | Build | Output |
| --- | --- | --- | --- | --- |
| backend | `backend` | `npm install` | `npm run build` | function at `api/[...path].ts` |
| frontend | `frontend` | `npm install` | `npm run build` | `dist` |

### Continuous integration (GitHub Actions)

- `.github/workflows/ci.yml` runs on PRs and pushes to `main`: installs with
  `npm ci`, validates the Prisma schema, builds both packages, and builds both
  Docker images without pushing them. This is the same validation that
  Docker Desktop performs locally.
- `.github/workflows/database.yml` applies `prisma migrate deploy` and seeds
  when Prisma files change, or when you run it manually with **Run workflow**.

Add these GitHub repository secrets (**Settings → Secrets and variables →
Actions**) for the database workflow:

| Secret | Value |
| --- | --- |
| `DATABASE_URL_DIRECT` | the **direct** Prisma/Neon connection string (never the pooled one) |
| `JWT_SECRET` | same value as in Vercel (≥ 32 characters) |
| `ADMIN_EMAIL` | administrator login email |
| `ADMIN_PASSWORD` | strong administrator password |

Optional repository variable: `ADMIN_NAME` (default `Operations Administrator`).

> Never put connection strings or tokens in `vercel.json`, workflow files, or
> any committed file. They belong only in Vercel/GitHub secret storage.

### Local development with Docker Desktop

`docker-compose.yml` still uses the bundled local Postgres, so local work is
independent of the production database:

```bash
docker compose up --build
```

To point the local backend at the hosted Prisma/Neon database instead, put the
connection strings in an untracked `.env` at the repo root and override the
backend database variables:

```bash
DATABASE_URL=<direct-or-pooled-connection-string> \
DATABASE_URL_POOLED=<pooled-connection-string> \
docker compose --profile tools up --build
```

`DATABASE_URL_POOLED` is optional locally; the app falls back to `DATABASE_URL`.

---

## Troubleshooting

- `Missing script: "install:all"` → Vercel is still using the repo-root install
  command. For a `backend`/`frontend` project set **Install Command** explicitly
  to `npm install` in **Settings → General → Build & Development Settings**.
- `Prisma Client did not initialize yet` → confirm `npm run build` ran
  `prisma generate`, and that `DATABASE_URL` is set for the function.
- Prisma validation/build fails with missing `DIRECT_URL` → add a direct plain
  PostgreSQL connection string to the backend environment (and to CI).
- `Prisma Accelerate only works with...` / `prisma://` errors → set both
  `DATABASE_URL` and `DIRECT_URL` to plain `postgresql://` connection strings;
  runtime queries should use a pooled endpoint when available.
- ERP pages return 404 → confirm the API is running the current build and that
  `/api/v1/erp` is reachable; redeploy after applying the ERP migration and seed.
- An upload fails with a durable-storage error → connect a private Blob store to
  the project running the API, then redeploy. Local disk is not durable on
  Vercel Functions.
- Admin login succeeds but redirects back to login → cookie is not being sent.
  Check `CORS_ORIGIN` contains the exact frontend origin and that `NODE_ENV=production`
  is set on the backend (for `SameSite=None; Secure`).
- CORS `Origin not allowed` → same `CORS_ORIGIN` check; include protocol and no
  trailing slash.

## Known limitations

- Rate limiting uses an in-memory store, so each function instance has its own
  counter.
- Upload size is bound by the Vercel Function request-body limit. The
  recommended `MAX_UPLOAD_MB=4` is lower than the `8 MB` stated in the quote form
  copy (`frontend/src/i18n/{en,ar}.ts`); update that copy if you keep the limit.
- Private Blob files are served through the authenticated
  `/api/v1/quotes/:id/attachments/:attachmentId` endpoint; never expose the raw
  Blob URL.
