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
PostgreSQL from the app's point of view.

- **Neon:** create a project, enable connection pooling, and copy the **pooled**
  connection string (hostname contains `-pooler`).
- **Prisma Postgres:** the Vercel integration injects several variables. The
  backend automatically prefers `DATABASE_URL_POOLED` (host
  `pooled.db.prisma.io`) for runtime queries, so no manual override is needed.
  The other injected variables (`DATABASE_URL`, `POSTGRES_URL`,
  `PRISMA_DATABASE_URL`) point at the direct endpoint and are used for
  migrations. If the integration ever injects an accelerated `prisma://...`
  value, the backend falls back to `DIRECT_URL`.

A plain `postgres://` / `postgresql://` value is what the app expects — never a
`prisma://...` URL.

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

## 3. Connect Vercel Blob (quote attachments and CVs)

Vercel Functions have an ephemeral filesystem, so local disk uploads cannot be
used in production.

1. In the **backend** project, open **Storage → Create Database → Blob**, choose
   **Private**, and connect it to Production (and Preview if needed).
2. The connection injects `BLOB_STORE_ID` + `VERCEL_OIDC_TOKEN`, which the SDK
   uses automatically. Alternatively enable **read-write token env var** for
   `BLOB_READ_WRITE_TOKEN`.
3. Redeploy so the function sees the new variables.

Local Docker development needs no Blob configuration: with no credentials the
app keeps writing to `UPLOAD_DIR` as before.

---

## 4. Environment variables

### Backend project

| Variable | Example / notes |
| --- | --- |
| `DATABASE_URL` | required plain `postgres://...` connection string |
| `DATABASE_URL_POOLED` | preferred at runtime (injected by Prisma Postgres integration) |
| `DIRECT_URL` | only when Prisma Postgres sets `DATABASE_URL` to `prisma://...` |
| `JWT_SECRET` | `openssl rand -hex 32` — at least 32 characters |
| `JWT_EXPIRES_IN` | `8h` |
| `NODE_ENV` | `production` |
| `CORS_ORIGIN` | **frontend** origin, e.g. `https://rfy.vercel.app` (comma-separate extras) |
| `PUBLIC_SITE_URL` | **frontend** origin |
| `UPLOAD_DIR` | `/tmp/uploads` (fallback only; Blob is used in production) |
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
**same** `DATABASE_URL` and `JWT_SECRET` as Vercel:

```bash
docker run --rm \
  -v "C:/rfy/backend:/app" -w /app \
  -e DATABASE_URL="postgresql://..." \
  -e JWT_SECRET="same-32-character-secret-as-vercel" \
  -e ADMIN_EMAIL="admin@your-domain.com" \
  -e ADMIN_PASSWORD="your-strong-password" \
  -e ADMIN_NAME="Operations Administrator" \
  -e SEED_DEMO_DATA="false" \
  node:26-bookworm \
  sh -c "npm install --no-audit --no-fund && npx prisma migrate deploy && npx prisma generate && npm run seed"
```

On Windows PowerShell use backticks (`` ` ``) for line continuations. On
macOS/Linux replace `C:/rfy/backend` with the absolute path to `backend`.

`migrate deploy` applies `backend/prisma/migrations/20260101000000_init`.
`seed` creates the administrator and the bilingual service catalogue. Both are
idempotent. If the admin email already exists, seed will **not** change its
password — reset it in the database or use a new email.

---

## 6. Verify

- `GET <backend-origin>/api/v1/health` → `"database": "up"`.
- Public pages load directly by URL (`/services`, `/tracking`, `/quote`).
- EN/AR switch flips direction and translations.
- Quote with attachment → visible in admin quote detail; attachment downloads.
- Careers application with a CV is stored.
- `/admin/login` → dashboard sidebar visible; admin cookie survives a refresh.

---

## 7. GitHub CI/CD

### Continuous deployment (Vercel)

Both Vercel projects are connected to `ahmedgfathy/rfy-logistics` on `main`, so
**every push to `main` automatically deploys** — no extra GitHub Action is
needed. Each project only deploys when changes land in its own Root Directory
(`backend/` or `frontend/`).

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
- `Prisma Accelerate only works with...` / `prisma://` errors → set
  `DATABASE_URL` to the `postgresql://` connection string (or provide
  `DIRECT_URL`).
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
