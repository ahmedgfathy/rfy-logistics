# Security checklist

## Implemented

| Control | Where |
| --- | --- |
| Password hashing with bcrypt cost 12 | `controllers/auth.controller.ts`, `db/seed.ts`, `admin.controller.ts` |
| Generic login error (no account enumeration) + constant comparison path | `auth.controller.ts` |
| JWT signed with a >=32-character secret (validated at boot, process exits on failure) | `config/env.ts` |
| Session in httpOnly, SameSite=Lax cookie; `Secure` in production | `middleware/auth.ts` |
| Role-based authorization (ADMIN / EDITOR); user management + audit log are ADMIN-only | `middleware/auth.ts`, `routes/admin.routes.ts` |
| Foreign-origin rejection for state-changing requests | `app.ts` |
| Strict CORS allowlist with credentials | `app.ts` |
| Helmet security headers; `x-powered-by` disabled | `app.ts` |
| Rate limiting per route class (global, auth, submissions, tracking) | `middleware/rateLimit.ts` |
| Schema validation on every write; parsed output replaces raw input | `validators/schemas.ts`, `middleware/validate.ts` |
| SQL injection resistance through Prisma parameterisation | all data access |
| Upload restriction: MIME allowlist (PDF/PNG/JPEG/WEBP/DOCX/XLSX), 8 MB default, 3 files max, randomised stored filename | `middleware/upload.ts` |
| Customer documents never served statically; streamed only via an authenticated route with an ownership-scoped query | `quote.controller.ts#downloadAttachment` |
| Path traversal protection (`path.basename` before joining the upload directory) | `quote.controller.ts` |
| Audit log for login, logout, quote/contact status changes, shipment creation and events, user creation, content changes | `services/audit.service.ts` |
| No secret in code or git: `.env` ignored, `.env.example` contains no real credentials | `.gitignore`, `.env.example` |
| Non-root container user in the production backend image | `backend/Dockerfile` |
| Database not published in the production compose file | `docker-compose.prod.yml` |
| Safe error responses (no stack traces in production) | `middleware/error.ts` |
| Private, `no-store` caching for tracking, quotes, contacts, admin responses | controllers |
| Multipart orphan cleanup when validation or persistence fails | `quote.controller.ts` |

## Requires action before production

1. **Rotate every default credential.** `JWT_SECRET`, `POSTGRES_PASSWORD`, `ADMIN_PASSWORD`
   and the pgAdmin password are placeholder values in `.env.example`.
2. **Serve over HTTPS.** Cookie `Secure` is enabled when `NODE_ENV=production`; TLS
   termination happens in front of the frontend container.
3. **Add a Content-Security-Policy.** `helmet` CSP is disabled for the API because it returns
   JSON only; the frontend should define a CSP at the reverse proxy.
4. **Transactional email.** No provider is connected; submissions are logged and can be
   forwarded through `NOTIFY_WEBHOOK_URL`. Add SPF/DKIM before sending as the client domain.
5. **Back up PostgreSQL and the `uploads` volume** on a schedule, and test restoration.
6. **Review the legal pages with a lawyer.** Privacy and Terms are templates, clearly marked
   as such in the UI and in `docs/CONTENT_TODO.md`.
7. **Add malware scanning** for uploaded documents if they will be opened by staff
   (currently limited to MIME allowlist + size caps).
8. **Consider 2FA** for administrator accounts when the dashboard goes beyond a small
   internal team.
9. **Rotate the seeded admin password** and delete unused accounts. There is no
   self-service password reset yet.
10. **Set `SEED_DEMO_DATA=false`** in production so demonstration shipments are not created.

## Known gaps

- No automated security test suite (SAST/DAST) has been run.
- No account lockout after repeated failed logins beyond the IP rate limit — a distributed
  attacker is only slowed, not stopped.
- The audit log is written but has no retention/export policy yet.
