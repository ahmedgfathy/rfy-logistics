# Deploying RFY Logistics to Vercel + Neon

This repository is deployed as **one Vercel project**:

| Piece | Where it runs |
| --- | --- |
| React/Vite public site + admin UI | Static output from `frontend/dist` |
| Express REST API | Vercel Function at `api/[...path].ts` (handles `/api/*`) |
| PostgreSQL | Neon serverless Postgres |
| Quote/CV uploads | Vercel Blob (private) |

Keeping the API on the same origin as the frontend means the existing
`SameSite=Lax` admin session cookie works without CORS/cookie workarounds.

---

## 1. Create the Neon database

1. Create a Neon project at <https://console.neon.tech> (pick a region close to
   your Vercel deployment).
2. Open **Connection Details**, enable **Connection pooling**, and copy the
   **pooled** connection string (its hostname contains `-pooler`). Use it as
   `DATABASE_URL`. The pooled pooler is important: every serverless invocation
   opens its own Prisma connection.

---

## 2. Import the repository into Vercel

1. In Vercel, **Add New → Project** and import
   `https://github.com/ahmedgfathy/rfy-logistics.git`.
2. Use branch `main`, **Root Directory** `.` (the repository root). This is
   critical: Vercel often auto-detects the Vite app and preselects `frontend`.
   If the root is `frontend`, the install command runs from the wrong folder and
   fails with `Missing script: "install:all"`. Change it under
   **Project Settings → General → Root Directory** and save before deploying.
3. Framework preset: **Other**. The settings come from `vercel.json`:
   - Install: `npm install && npm run install:all`
   - Build: `npm run build:all`
   - Output: `frontend/dist`
4. Add the environment variables below (at least **Production**; Preview is
   recommended so PR deployments work too).

   | Variable | Example / notes |
   | --- | --- |
   | `DATABASE_URL` | Neon **pooled** connection string, include `?sslmode=require` |
   | `JWT_SECRET` | `openssl rand -hex 32` — must be ≥ 32 characters |
   | `JWT_EXPIRES_IN` | `8h` |
   | `NODE_ENV` | `production` |
   | `CORS_ORIGIN` | `https://your-project.vercel.app` (comma-separate extra domains) |
   | `PUBLIC_SITE_URL` | `https://your-project.vercel.app` |
   | `VITE_API_BASE_URL` | `/api/v1` (same-origin) |
   | `VITE_SITE_URL` | `https://your-project.vercel.app` |
   | `UPLOAD_DIR` | `/tmp/uploads` (fallback only; Blob is used in production) |
   | `MAX_UPLOAD_MB` | `4` — stay under the Vercel Function request-body limit |
   | `SEED_DEMO_DATA` | `false` for production |
   | `ADMIN_EMAIL` | Bootstrap administrator email |
   | `ADMIN_PASSWORD` | Strong password (≥ 8 characters) |
   | `ADMIN_NAME` | Display name for the administrator |

   `VITE_*` variables are baked into the frontend at build time, so after
   changing any of them trigger a new deployment.

5. Deploy. The first build installs both workspaces, builds the site, generates
   the Prisma client for the API function, and publishes `frontend/dist`.

---

## 3. Connect Vercel Blob (for quote attachments and CVs)

Vercel Functions have a read-only, ephemeral filesystem, so the previous local
disk uploads cannot be used in production.

1. In the project, open **Storage → Create Database → Blob**, choose
   **Private**, and connect it to **Production** (and Preview if needed).
2. Connecting the store injects `BLOB_STORE_ID` and `VERCEL_OIDC_TOKEN`; the SDK
   picks these up automatically. Alternatively enable **Add a read-write token
   env var to this connection** to use `BLOB_READ_WRITE_TOKEN`.
3. Redeploy so the function sees the new variables.

Local Docker development needs no Blob configuration — when no Blob credentials
are present the app keeps writing to `UPLOAD_DIR` exactly as before.

---

## 4. Apply the database schema and create the admin user

From a machine with Docker, run the following once against the Neon database.
Use the **same** `DATABASE_URL` and `JWT_SECRET` as in Vercel.

```bash
docker run --rm \
  -v "C:/rfy/backend:/app" -w /app \
  -e DATABASE_URL="postgresql://...@ep-xxx-pooler...neon.tech/..." \
  -e JWT_SECRET="same-32-character-secret-as-vercel" \
  -e ADMIN_EMAIL="admin@your-domain.com" \
  -e ADMIN_PASSWORD="your-strong-password" \
  -e ADMIN_NAME="Operations Administrator" \
  -e SEED_DEMO_DATA="false" \
  node:20-bookworm \
  sh -c "npm install --no-audit --no-fund && npx prisma migrate deploy && npx prisma generate && npm run seed"
```

On Windows PowerShell use backticks (`` ` ``) for line continuations. On macOS/Linux
replace `C:/rfy/backend` with the absolute path to the `backend` folder.

`migrate deploy` applies `backend/prisma/migrations/20260101000000_init`.
`seed` creates the administrator and the bilingual service catalogue. Both are
idempotent and safe to re-run.

---

## 5. Verify the deployment

- `GET https://your-project.vercel.app/api/v1/health` → `database: "up"`.
- Public pages load directly by URL (e.g. `/services`, `/tracking`, `/quote`).
- The language switch toggles EN/AR and RTL layout.
- Services dropdown opens and links work.
- Submit a quote request with a small attachment; confirm it appears in the
  admin quote detail page and that the attachment downloads.
- Submit a careers application with a CV.
- Log in at `/admin/login` with the seeded administrator and check the dashboard.
- Add a custom domain in Vercel if needed, then add that domain to
  `CORS_ORIGIN` and `PUBLIC_SITE_URL` and redeploy.

---

## Troubleshooting

- `Missing script: "install:all"` during the Vercel install step → Root Directory
  is `frontend` instead of the repository root. Fix it in
  **Settings → General → Root Directory**, then redeploy.
- `Prisma Client did not initialize yet` in runtime logs → make sure the build
  completed `npm --prefix backend run build` (which runs `prisma generate`) and
  that `DATABASE_URL` is set for the function.

## Known limitations

- **Rate limiting** uses an in-memory store, so each function instance has its
  own counter. It is not a global distributed limit.
- **Upload size** is bound by the Vercel Function request-body limit. The
  recommended `MAX_UPLOAD_MB=4` is lower than the `8 MB` mentioned in the quote
  form copy (`frontend/src/i18n/{en,ar}.ts`); update that copy if you keep a
  smaller limit. For larger files, move to direct browser-to-Blob uploads.
- **Vercel Blob private files** are served through the authenticated
  `/api/v1/quotes/:id/attachments/:attachmentId` endpoint; never expose the raw
  Blob URL in the UI.
