# Bike Rental Platform

A bike/motorcycle rental website that has grown from a static marketing site into a full booking platform: public pages, Supabase-backed authentication, conflict-proof date-range booking, a customer "My Bookings" page, and an admin dashboard — all on top of a no-build-step HTML/SCSS/JS frontend.

Rebrand placeholders (business name, phone, address, deposit terms, etc.) are left as generic stand-ins (`Your Company Name`) — swap them before going live.

## Current status

- **Done**: public site, Supabase auth (OTP email login), conflict-proof booking holds with server-side pricing, booking cancellation, admin dashboard (bookings/bikes management), customer booking history.
- **Not built**: real payment capture (Razorpay), confirmed-booking cancellation with refund math, pickup/return workflow in the admin UI.
- **For full detail on what's done, what's verified vs. not, and why specific decisions were made**, see [`IMPLEMENTATION_STATUS.md`](IMPLEMENTATION_STATUS.md) (chronological engineering log — read top entry first) and [`FUTURE_ROADMAP.md`](FUTURE_ROADMAP.md) (deliberately deferred work).

## Pages

| Page | Purpose |
|---|---|
| `index.html` | Homepage / hero + bike showcase |
| `bike-shop.html` | Inventory listing with filters |
| `bike.html` | Bike detail page + booking widget (date range, live price preview, hold + cancel) |
| `login.html` | Email OTP login/signup |
| `my-bookings.html` | Customer booking history |
| `admin.html` | Admin dashboard (bookings, bikes, availability blocks) |
| `aboutus.html`, `contact.html`, `blogs.html` | Marketing/info pages |
| `pricing-policy.html`, `delivery-policy.html`, `privacy-policy.html`, `terms-condition.html` | Policy pages |

## Architecture

- **Frontend**: static HTML + SCSS + vanilla JS (ES6 modules), Bootstrap 5, no build/bundler step beyond Sass. Key JS modules live in `assets/js/` (`supabase-client.js`, `auth.js`, `booking.js`, `admin.js`, `my-bookings.js`, `bike-detail.js`, `bike-shop.js`).
- **Backend**: [Supabase](https://supabase.com) — Postgres with RLS, SQL RPC functions for booking logic (`create_booking_hold`, `cancel_booking_hold`, `get_bike_blocked_ranges`), Auth (passwordless email OTP), and Storage for bike images.
  - Schema and business logic live entirely in `supabase/migrations/` (profiles, bikes, bike_images, bike_blocks, bookings, payments_refunds, business_config, audit_log, storage, RPC functions).
  - Double-booking prevention relies on a Postgres exclusion constraint on booking date ranges, not application-level locking.
  - Pricing is always computed server-side from `bikes.price_paise` — the client never sends a price.
- **Tests**: pgTAP suites in `supabase/tests/database/` covering RLS/constraints and booking-function behavior (auth boundaries, date validation, conflict rejection, ownership).
- See [`docs/data-model.md`](docs/data-model.md), [`docs/threat-model.md`](docs/threat-model.md), and [`docs/adr/`](docs/adr) for design rationale.

## Setup

### Frontend

No build step is required to run the site itself. Sass is only used to compile SCSS:

```bash
cd assets/css
npm install                          # installs sass locally (pinned via package-lock.json)
npx sass --watch main.scss:main.css  # watch & compile on save
```

Serve the repo root with any static file server (needed for ES module imports / fetch to work reliably):

```bash
python3 -m http.server 8080
# then open http://localhost:8080/index.html
```

### Backend (Supabase)

This project uses a real hosted Supabase project — there is no local-only mode for the booking/auth features.

1. Install the [Supabase CLI](https://supabase.com/docs/guides/cli).
2. Copy `.env` locally (not committed — see `.gitignore`) with your project's `SUPABASE_URL`, keys, and DB password. The frontend only needs the public `SUPABASE_URL` and publishable/anon key (already set in `assets/js/supabase-client.js`); the service role key and DB password are for CLI/admin operations only and must never ship to the client.
3. Apply schema changes: `supabase db push` (or `--remote` against the hosted project, per `supabase/config.jsonc`).
4. Run the test suite: pgTAP tests in `supabase/tests/database/` (see Supabase CLI docs for `supabase test db`).

**Before pushing config changes to the hosted project**, always run `supabase config diff --remote` first — `supabase/config.jsonc` has drifted from the hosted project's real settings before (see `IMPLEMENTATION_STATUS.md`), and pushing blind can revert unrelated fixes.

## Technologies

- HTML5, SCSS, vanilla JavaScript (ES6 modules)
- Bootstrap 5, Owl Carousel / Splide JS, jQuery (utility support)
- Supabase (Postgres, Auth, Storage, RLS, RPC)
- pgTAP for database tests

## Project docs

Audit and status documents accumulated during development — useful context, not required reading to run the site:

- [`IMPLEMENTATION_STATUS.md`](IMPLEMENTATION_STATUS.md) — chronological engineering log (read first in a new session)
- [`ENGINEERING_PERSONA_PROMPT.md`](ENGINEERING_PERSONA_PROMPT.md) — senior-engineer/CTO-level system prompt for this codebase
- [`PRODUCTION_READINESS.md`](PRODUCTION_READINESS.md), [`SECURITY_AUDIT.md`](SECURITY_AUDIT.md), [`PERFORMANCE_AUDIT.md`](PERFORMANCE_AUDIT.md), [`ACCESSIBILITY_AUDIT.md`](ACCESSIBILITY_AUDIT.md), [`SEO_AUDIT.md`](SEO_AUDIT.md), [`QA_REPORT.md`](QA_REPORT.md), [`PROJECT_AUDIT.md`](PROJECT_AUDIT.md)
- [`FUTURE_ROADMAP.md`](FUTURE_ROADMAP.md) — features deliberately not built, with rationale
- `reports/` — axe-core accessibility and Lighthouse output
- `docs/` — data model, threat model, privacy data inventory, ADRs

## Deployment

The frontend is a static site, deployable as-is to Netlify, Vercel, GitHub Pages, or any static host. It talks directly to the hosted Supabase project, so no server-side component is needed beyond Supabase itself. See `_headers.example` for recommended security headers.

## License

This project is open for educational and non-commercial use. Attribution appreciated.
