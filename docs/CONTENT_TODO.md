# Content that must be replaced before launch

Everything below is a placeholder created for this build. None of it should be published as
factual company information.

## Brand

- **Company name** — confirmed as **RFY**; displayed as `RFY Logistics / RFY للخدمات اللوجستية`
  (set in `frontend/src/lib/site.ts`, `frontend/src/i18n/en.ts` (`brand.name`), `ar.ts`,
  the seed `companySettings`, and `frontend/index.html`). Confirm the legal name and the
  Arabic wordmark with the client.
- **Logo** — the SVG mark in `components/layout/Logo.tsx` and `public/favicon.svg` is a
  placeholder. Replace with the client’s vector logo (light and dark versions needed).
- **Colours** — navy `#0B1F33`, brand blue `#155EEF`, ocean `#1677B8`, amber `#F5A623`.
  These are a starting direction, not a final identity; change `frontend/tailwind.config.js`
  and the `:root` tokens in `frontend/src/index.css`.
- **Tagline** — “Freight forwarding & customs clearance”.

## Media

- **Hero background video** — `frontend/public/videos/hero-bg.mp4` is a free-license stock clip
  from Pexels ("A cargo ship loaded with containers at port" by Cyriac von Czapiewski,
  pexels.com/video/15187013). Replace it with the client's own footage (port operations, their
  team, their cargo) when available; keep the file under ~10 MB, H.264/MP4, and update the
  poster image `frontend/public/images/hero-terminal.jpg` to match. Logistics photos in
  `frontend/public/images/` are also placeholder stock/AI images.

## Contact & company facts

| Item | Current placeholder | File |
| --- | --- | --- |
| Phone | +20 100 000 0000 | `lib/site.ts`, `backend/src/db/seed.ts` (settings) |
| WhatsApp | +20 100 000 0000 | `lib/site.ts` |
| Email | info@rfy-demo.local | `lib/site.ts`, seed |
| Operations email | operations@rfy-demo.local | `lib/site.ts`, seed, `TrackingPanel.tsx` |
| Address (EN/AR) | 14 El Horreya Avenue, Alexandria | `lib/site.ts`, seed |
| Business hours | Sat–Thu, 08:30–17:00 | `lib/site.ts`, seed |
| Offices | Alexandria + Cairo | `lib/site.ts` |
| LinkedIn | linkedin.com | `lib/site.ts` |
| Google Maps | not embedded | `pages/Contact.tsx` (placeholder card) |

## Deliberately absent (do not invent)

- **Statistics** (shipments moved, clients, years of experience) — no counters are shown
  because no verified figures were supplied.
- **Testimonials** — the model exists (`Testimonial.isApproved = false` by default) and the
  UI is prepared, but nothing is seeded.
- **Partner / carrier logos** — same: `Partner.isApproved = false`, nothing seeded.
- **Certifications & memberships** (FIATA, IATA, customs broker licences) — the About page
  explicitly states that no claim is made until documentation is provided.
- **Team names and photographs** — the About page says profiles are added once approved
  biographies are supplied.
- **News articles** — none are published; the insights section shows an empty state until
  the operations team publishes real articles from the dashboard.
- **Warehousing** — the client owns no warehouses, so storage is described as a partner
  service, and no warehouse capacity is claimed.

## Demo data in the database

Three shipments are seeded so tracking can be demonstrated:

`DEMO-SEA-1001`, `DEMO-AIR-1002`, `DEMO-ROAD-1003`

They are flagged `isDemo = true` and the public tracking page shows a “Demonstration data”
warning whenever such a record is displayed. Set `SEED_DEMO_DATA=false` and delete those rows
before launch.

## Legal

`/privacy` and `/terms` are **templates**. Both are shown in the UI and in
`docs/SECURITY.md` as text that must be reviewed by Egyptian counsel before publication.

## Arabic copy

All Arabic strings were written for this build and are structurally complete (RTL, Arabic
typography, Arabic numerals via `Intl`). Have a native logistics copywriter review
terminology such as التخليص الجمركي / وكيل الشحن / النقل الداخلي before launch.
