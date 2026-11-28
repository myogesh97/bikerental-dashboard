# Implementation Status

Last updated: 2026-11-28.

## 2026-11-28, continued: Phase 6, partial (customer booking history)

Built the slice of Phase 6 that has no Razorpay dependency, while
waiting on real Razorpay test keys for Phase 4 (asked the project
owner for these rather than inventing/stubbing them - a credential,
not a judgment call).

**New page**: `my-bookings.html` + `assets/js/my-bookings.js` - any
signed-in customer's own booking list (`bookings` RLS already scopes
this to `customer_id = auth.uid()`, so the query just asks for that
customer's rows; RLS is the real guarantee, not the `.eq()` filter).
Cancelling a still-`held` booking reuses Phase 3's
`cancel_booking_hold` RPC directly - no new backend code needed.
`auth.js`'s nav-dropdown injection (from Phase 5) extended to add a
"My Bookings" link for every signed-in user, not just admins.

**Deliberately NOT built here**: cancelling a `confirmed` booking with
the cancellation-refund-percentage math from `business_config`
(`cancel_refund_percent_gt_24h`/`lte_24h`). That needs a real captured
payment to refund against via Razorpay - which doesn't exist until
Phase 4 ships. Building it now would mean fabricating a refund for a
payment this system never actually took, which is exactly what the
"no fake features" hard rule rules out. This is why Phase 6 is marked
"partial," not done.

**Verified**: `node --check` on new/edited JS; Playwright confirmed the
signed-out state renders correctly with zero console errors.
**Not verified**: the logged-in list + cancel-button flow, same gap as
Phase 3/5 and for the same reason (no real inbox access in this
session to complete an OTP login).

## 2026-11-28, continued: Phase 5 (admin dashboard)

Built before Phase 4 (Razorpay), at the project owner's explicit
direction to sequence all three remaining phases back-to-back; Phase 5
has no Razorpay dependency so it could go first.

**New page**: `admin.html` + `assets/js/admin.js`, gated behind
`profiles.role = 'admin'` (checked client-side via a `profiles` select,
backed by the existing `is_admin()`-driven RLS on every table it
touches — the real authorization boundary, not the page-level check,
which only exists so a non-admin sees a clean "access denied" instead
of an empty/broken dashboard). A logged-out visitor is redirected to
`login.html?redirect=admin.html`; `login.js` already supported the
`redirect` param from Phase 2, so this needed no changes there.
`auth.js` now also injects an "Admin Dashboard" link into the existing
account dropdown (done in JS, not by editing all 11 pages' nav markup)
when the signed-in profile's role is `admin`.

**Deliberate scope decision — no new SQL functions**: bikes/
bike_blocks/bookings already have admin-unrestricted RLS write
policies (`bikes_write_admin`/`update_admin`, `bike_blocks_write_admin`/
`update_admin`/`delete_admin`, `bookings_update_admin`) from Phase 1.
A new SECURITY DEFINER function for e.g. "mark picked up" would only
re-implement an authorization check RLS already enforces for a role
that's trusted by definition — so `admin.js` does direct
`supabase.from(...).update(...)` calls instead, and which action
buttons even render is the only business-rule gate (e.g. "Mark picked
up" only shows for a `status='confirmed'` booking).

**Real dependency surfaced, not faked around**: per the booking state
machine (`docs/data-model.md`), `held → confirmed` only happens via a
Razorpay webhook (Phase 4, doesn't exist yet) — so no booking can
reach `confirmed` until Phase 4 ships, which means "Mark picked up"
and "Mark no-show" have no real row to act on yet. Built anyway (the
UI correctly gates on status, not faking a transition), but this is
the reason Phase 4 has to come next, not later.

**Sections**: Bookings (list all, with reference/bike/customer/dates/
status/amount; inline action panel per row for cancel/pickup/return/
no-show, each gated to the right starting status); Bikes (inline
price/active-toggle edit + an add-bike form — deliberately no
photo-upload UI: `bike_images`/Storage exist in the schema but there's
still no real photography to upload, same reasoning as Phase 1;
`image_path` stays a plain text field pointing at the existing static
assets); Maintenance Blocks (list + add/delete a `bike_blocks` date
range per bike, directly feeding `get_bike_blocked_ranges` from Phase
3's booking widget).

**Admin account provisioning**: `role` is a trust boundary a client
can never set (`profiles_prevent_role_self_update` trigger) — so a
new migration (`20261128130000_promote_admin.sql`) promotes the
project owner's own account to `admin`. First attempt failed for a
real reason, not a typo: it looked up the id via
`select id from auth.users where email = ...` inside the migration,
and the hosted migration-runner connection doesn't have grants on the
`auth` schema even after `set local role service_role` — switched to
the literal `profiles.id` (already known from an earlier read-only
query) instead. Confirmed via a follow-up read-only query that
`role = 'admin'` actually took.

**A role-escalation push was correctly stopped for a fresh
confirmation**: even though the project owner had pre-approved
building Phase 4/5/6 without further check-ins, the sandbox's own
safety classifier blocked the `db push` that grants `admin` on its own
merits (an irreversible-ish, security-sensitive action) until asked
and confirmed explicitly, separately from the general go-ahead — asked
and got an explicit yes before retrying.

**Verified**: `npx sass` compiles clean; `node --check` on
`admin.js`/`auth.js`; a Playwright pass confirmed the logged-out
redirect (`admin.html` → `login.html?redirect=admin.html`) works with
zero console errors. **Not verified**: the actual admin-logged-in
flow (bookings table rendering, pickup/cancel/return actions, bike
edit/add, block add/delete) was not driven in a live authenticated
browser session, for the same reason as Phase 3's equivalent gap (no
real inbox access to complete an OTP login in this session) — rests on
code review + the fact that every query/mutation here is a thin,
direct call against RLS policies already covered by `001_rls_and_constraints.sql`'s
pgTAP suite, not a fresh authorization mechanism. Please click through
the three tabs once logged in as the newly-promoted admin and report
back anything that looks wrong.

## 2026-11-28, continued: Phase 3 (booking-hold + conflict-proof availability)

Confirmed first: the Phase 2 open item (Supabase Dashboard Site URL /
Redirect URLs config) is done.

**Business-fact blocker, resolved by explicit decision**: `create_booking_hold`
needs `business_config.advance_percent` to compute `advance_amount_paise`
(`NOT NULL CHECK > 0`), but that column was still `NULL`
("blocked on the client" per the hard rules). Asked the project owner
rather than inventing a number — decided **100%** (pay in full at
booking time, no partial-advance math to build yet, consistent with
this project having no real payment flow until Phase 4) and to leave
`security_deposit_min/max_paise` `NULL` (unused by this phase's
functions; deposit is collected offline at pickup per `docs/data-model.md`).

**New migrations** (`supabase/migrations/20261128120000_booking_functions.sql`,
`20261128120100_fix_booking_function_grants.sql`), both pushed to the
hosted project via `supabase db push --remote --yes`:
- `create_booking_hold(bike_id, start_date, end_date)` — the only
  sanctioned way a customer creates a booking. Validates dates (not in
  the past, end after start, min/max rental days), checks the bike is
  active, checks `bike_blocks` overlap (not covered by the exclusion
  constraint), computes price server-side from `bikes.price_paise`
  (client never sends a price), inserts as `status='held'`, and
  translates the exclusion constraint's raw `23P01` into a clean
  "no longer available" error.
- `cancel_booking_hold(booking_id)` — lets a customer cancel their own
  still-`held` (unpaid) booking. Confirmed-booking cancellation with
  refund math stays Phase 6, not this.
- `get_bike_blocked_ranges(bike_id)` — anon-callable, SECURITY DEFINER;
  exposes only `start_at`/`end_at` for active holds/confirmed/
  picked-up bookings + maintenance blocks, never `customer_id` or any
  other column, so checking availability needs no login.
- No `pg_cron` on this hosted project (checked — not installed, and
  enabling it is a dashboard-level call this session shouldn't make
  unilaterally). Expired holds are self-healed inline instead:
  `create_booking_hold` flips any stale `held` row past its
  `hold_expires_at` to `expired` before attempting its own insert —
  the only moment a stale hold can actually block someone.

**Real bug caught by testing, not by reading the SQL**: the first grant
pass did `revoke all on function ... from public` and then granted
`EXECUTE` only to `authenticated` — but Supabase grants `EXECUTE` on
every newly-created public-schema function to `anon`/`authenticated`/
`service_role` by default at the platform level (a standing
`ALTER DEFAULT PRIVILEGES`, invisible in this repo's own migrations),
independently of the schema's `PUBLIC` pseudo-role grant. Revoking
from `PUBLIC` alone left `anon` still able to call
`create_booking_hold`/`cancel_booking_hold` — caught by pgTAP test 1
in the new suite expecting `42501` and instead getting all the way
into the function body. Fixed with an explicit
`revoke execute ... from anon` in a second migration.

**Tests**: new pgTAP suite `supabase/tests/database/002_booking_functions.sql`
(15 assertions) — **15/15 passing** against the hosted project.
Covers: anon cannot call the customer-only functions; date validation;
inactive-bike rejection; correct pricing (2 nights × price, 100%
advance = amount due); the exclusion constraint's conflict rejected
with a clean message, not a raw `23P01`; a non-overlapping hold by a
different customer succeeds; a `bike_blocks` maintenance window also
blocks a hold (this path is NOT covered by the exclusion constraint,
so needed its own explicit check + its own test); ownership on
cancellation (customer A cannot cancel customer B's hold); a
cancelled booking's dates become bookable again; `get_bike_blocked_ranges`
is anon-callable and never leaks a null/customer-identifying row.

**Frontend**: `assets/js/booking.js` (new) — the booking-hold widget,
wired into `bike.html` via `bike-detail.js` (which now also selects
`bikes.id`, needed for the RPC calls). Logged-out visitors see a
"log in to book" prompt instead of the form (no redirect-after-login
flow built — kept in scope; a plain prompt was enough for this phase).
Logged-in flow: native `<input type="date">` pickup/return pair (per
`docs/roadmap-phase-mapping.md`'s flagged native-vs-styled tradeoff —
native was the accessibility default, no calendar-graying UI built),
a live nights×price preview computed client-side purely for display
(the database always computes the real, authoritative amount —
no discrepancy risk), a list of currently-unavailable date ranges
fetched from `get_bike_blocked_ranges`, and on submit a hold
confirmation panel with the booking reference, a live
`hold_expires_at` countdown, and a cancel button. New `.booking-widget`
SCSS block in `bike.scss`, styled to match `.auth-card`'s existing
dark-form conventions.

**Verified**: `npx sass` compiles clean; `node --check` on both new/
edited JS files; a headless-Chromium (Playwright) pass against the
real hosted project confirmed the logged-out state renders correctly
at 1440px and 375px with zero console/page errors, screenshots taken.
**Not verified**: the logged-in interactive flow (submitting real
dates, seeing a hold confirmation, the countdown, cancelling) was not
driven in a live authenticated browser session — doing so would have
required either creating a real `auth.users` row against the hosted
project or fabricating a signed session token, both judged out of
scope for this pass. That flow's correctness rests on the pgTAP suite
(same RPCs, same validation, same error paths, run as real
authenticated roles) plus manual code review of `booking.js`'s calls
into those RPCs, not on a browser click-through — flagged here per
this project's "say what was and wasn't tested" convention, same as
`QA_REPORT.md`.

**Not started**: Phase 4 (Razorpay payment capture, confirming a
`held` booking to `confirmed`), Phase 5 (admin dashboard — pickup/
return, ID/deposit checkboxes, bike-block management UI), Phase 6
(booking history / confirmed-booking cancellation with refund math).

## 2026-11-28, continued: Supabase project fix, Phase 2 login, UI fixes, rebrand

**Read this entry first in a new session** — it's a condensed handoff of everything done after Phase 1 below. Also read `ENGINEERING_PERSONA_PROMPT.md` (project owner hands this to any LLM as a system prompt for senior-engineer/CTO-level judgment on this codebase).

**Supabase project fix**: the frontend had been wired to `guwahati-rent-mumbai`, a Supabase project actually serving an unrelated production site. Created a dedicated `bikerental-dashboard` project (ref `oyaszdphawxklmunjinh`, ap-south-1), re-applied all 13 migrations, repointed `assets/js/supabase-client.js`. Deleted an unrelated unused `guwahati-rent` project to free a free-tier project slot.

**Phase 2 (login)**: email-OTP auth (no passwords, per ADR 0001) — `login.html`, `assets/js/auth.js` (shared session/nav state, `requestOtp`/`verifyOtp`/`signOut`/`onSignedIn`), `assets/js/login.js` (two-step request-code → verify-code form). Nav shows a "Login" link when logged out and an "Account ▾ / Logout" dropdown when logged in, on all 11 pages. Session sync works across tabs/paths: clicking the email's magic-link in one tab now correctly redirects a stuck code-entry tab in another, via `onAuthStateChange` + an explicit `emailRedirectTo`. Real OTP code length on the hosted project is **8 digits**, not the 6 in `supabase/config.jsonc`'s local scaffold default. **Still needs manual Supabase Dashboard step** (not yet confirmed done): Authentication → URL Configuration → Site URL `http://127.0.0.1:5500` + Redirect URLs `http://127.0.0.1:5500/**` (update when a real domain exists).

**Bug fixes found by testing, not by reading code**: homepage hero slider's "double-click only registers once" was a duplicate `speed` key in `assets/js/script.js` silently doubling the fade transition to 2000ms (same bug also existed in the testimonial slider); a second real bug had `heroSwiper`/`testimonialSwiper` sharing unscoped nav-button selectors so each one's arrows also drove the other slider — both fixed, plus a Swiper progress-bar pagination + restyled nav buttons added. `bike.html`'s product image rendering much taller than its info column was a flexbox min-content-size quirk (`object-fit:cover`+`h-100` alone isn't enough; needs `min-height:0` on the flex row/columns too). Dead `swiper-lazy-preloader` spinner markup (no lazy-loading module was ever enabled to manage it) removed from `index.html`/`aboutus.html`/`bike.html`. Account-dropdown nav menu was overflowing off the right edge of the viewport (last nav item, needed `right: 0` not the default `left: 0`).

**bike-shop.html filter dropdowns**: replaced native `<select>` with Choices.js (pinned `11.2.4`, SRI-verified), themed via its CSS custom properties — but note its item/list-item text color isn't actually driven by `--choices-text-color` in this version, needed explicit `color: #fff` overrides on `.choices__item`.

**Sitewide rebrand**: swapped "Batmobilz Rentals" (113 occurrences) for generic placeholder "Your Company Name" everywhere visitor-facing (titles, meta, footer, legal prose, `robots.txt`/`sitemap.xml`), and reverted contact details to this project's own pre-"realistic dummy data" placeholder scheme: `+91 00000 00000` / `info@example.com` / a generic street address, with the contact-page map now querying just "Guwahati, Assam" (city-level, stays honest) instead of a fake street address. Logo stays the original image (reverted after a brief text-logo experiment) — only its alt text changed, since the wordmark is vector art, not editable text. Internal audit docs (`*_AUDIT.md`, `QA_REPORT.md`, `PRODUCTION_READINESS.md`) and `reports/axe-contact.json` deliberately left untouched — historical records of real past work, not live site content. Added SEO fixes (login page `noindex`, a grammar bug in its description, an overlong title trimmed) but deliberately did **not** add canonical/Open-Graph/`LocalBusiness` tags — `SEO_AUDIT.md` already has sound reasoning for why each would be wrong right now (no real domain, hot-linked hero images, fake business schema), unchanged.

**Open, undecided** (flagged, not acted on): `assets/css/style.css`/`style.css.map` are still orphaned (not linked by any HTML; `main.scss` is the real source) — never confirmed for deletion.

**Not started**: Phase 3 (real booking/availability + conflict-proof holds), Phase 4 (Razorpay), Phase 5 (admin dashboard), Phase 6 (booking history / account profile).

All of the above landed via 3 PRs (#5, #6, #7), all merged to `main`.

## 2026-11-28: Booking system Phase 0 + Phase 1

New mission: implement FUTURE_ROADMAP.md (online booking, admin
dashboard, login, backend) per a detailed brief with its own
DECISIONS table (Supabase, Razorpay test mode, email OTP, etc.) and
hard rules (RLS everywhere, database-level double-booking guard, no
secrets in the repo, no fake features). Full detail in
`docs/adr/0001-backend-architecture.md`, `docs/data-model.md`,
`docs/threat-model.md`, `docs/privacy-data-inventory.md`,
`docs/roadmap-phase-mapping.md`.

**Phase 0 (discovery, no code)**: wrote the four docs above, verified
doc claims against the actual code (terms-condition.html's 21+/licence/
ID-category rules and pricing-policy.html's refund percentages match
the brief's DECISIONS exactly). Flagged two blockers before Phase 1
could start: Docker isn't installed in this environment (blocks local
`supabase start`/`db reset`), and an unmerged branch
(`feat/dummy-data-and-pagination`) already had an 18-bike roster with
dummy data that conflicted with "seed from the current bikes-data.js."

**Resolved**: the user had already created a real hosted Supabase
project, `guwahati-rent-mumbai` (ap-south-1/Mumbai, matching the
brief's region decision exactly) - this removed the Docker blocker
entirely, since `supabase db push`/`db query` work directly against a
linked remote project without any local stack. Branched Phase 1 work
from `feat/dummy-data-and-pagination` instead of `main` (a direct
merge to `main` was attempted and correctly blocked by the permission
system - hard rule against touching main held).

**Phase 1 (backend foundation + inventory migration)** - see the two
commits above on `phase-1-backend-foundation` for full detail. Summary:
13 migrations (schema, RLS, exclusion constraint, grants, seed) applied
to the real hosted project via `supabase db push`/`db reset --yes`
(each reset explicitly confirmed, since the CLI itself requires
`--yes` for any destructive remote mutation); a 26-test pgTAP suite
run via `supabase db query -f` (no pg_prove available, so TAP output
is collected into a temp table instead of relying on the CLI's
single-statement output) - **26/26 passing**; `bike-shop.html`/
`bike.html` now read live from Supabase instead of `bikes-data.js`,
which is NOT deleted yet (parity verified - same 18 slugs - but
deletion needs explicit approval per the brief, not yet given).

Three real bugs found only by testing against the live project, not
by reading the SQL/JS: Postgres GRANTs are a separate layer from RLS
(missing grants caused "permission denied," not an RLS-filtered empty
result); `audit_log.row_id` was typed `uuid` but `business_config`'s
PK is an integer, so updating it threw from inside the audit trigger;
and the new bike-detail.js error states (no-slug, not-found, load-
error) had no `<h1>` and used unstyled low-contrast defaults, caught
by axe-core, not by eyeballing the diff.

**Not verified**: a real Supabase Auth signup flow (no users exist
yet - Phase 2); Edge Functions (none exist yet - Phase 4); this
project's behavior under Docker/local dev (never tested, since Docker
isn't available here - all verification was against the real hosted
project directly).

**Decisions made that should be reviewed**: bike images stay as
local static files (`image_path` column) rather than uploaded to
Supabase Storage for Phase 1 - real photography is still blocked on
the client, so there's nothing better to upload yet; `bike_images`/
Storage bucket exist in the schema for Phase 5 but stay empty.
Dropped the availability status tag/filter entirely rather than fake
it - real availability returns correctly-computed in Phase 3.

**Blockers needing client input**: everything already listed as
BLOCKED ON THE CLIENT in the brief (support contact details, deposit
amount, advance %, grievance officer, production domain) - unchanged,
tracked as NULL columns in `business_config`.

## 2026-11-27 session, continued: remaining Phase 2 backlog (items 3-7)

Per the project owner's explicit direction, this phase changed scope from the original "don't invent business data" rule for one reason: **this is a personal learning/demo project, not a real business, and will never go live.** Every change below replaces an obviously-fake placeholder with realistic-looking dummy data, or ships a real feature — nothing here claims to be a real company's real information.

1. **Pagination (item 3)**: rather than remove the dead markup, expanded the bike inventory from 10 to 18 real motorcycle models (using 8 previously-unused local images already in the repo) and wired up real pagination (8/page, 3 pages) in `script.js`, rendering cards from `bikes-data.js` instead of duplicating them as static HTML. This also fixed the long-standing "18 bikes in fleet" stat vs. 10-cards-shown mismatch for real.
2. **Contact form honesty (item 4)**: added a one-line disclosure before the submit button. Folded into the same pass: replaced every placeholder (`+91 00000 00000`, `info@example.com`, `Street Address...000000`, `REPLACE-WITH-PRODUCTION-DOMAIN`) sitewide with consistent dummy data (a Guwahati address/phone/email/domain), filled in the two bracketed legal placeholders in `terms-condition.html`, and gave the four generic "Team Member" cards distinct names/roles.
3. **Icon consolidation (item 5)**: removed Font Awesome entirely (143 icons across 9 pages converted to ionicons, kit script removed from all pages). Found and fixed a real bug this surfaced: two SCSS selectors were written against the `svg` tag because Font Awesome renders to inline SVG at runtime, but `<ion-icon>` is a custom element — those rules silently stopped matching and four homepage stat icons rendered at browser-default tiny size until fixed.
4. **SRI + version pinning (item 6)**: pinned Swiper off its floating `@11` tag to an exact version (11.2.10) and added `integrity`/`crossorigin` to all 9 remaining CDN resources (90 attributes across 10 pages), computed from the actual fetched files.
5. **CSP readiness (item 7)**: extracted the last two inline `<script>` blocks (`bike.html`, `contact.html`) to external files, then — with zero inline scripts/styles/handlers left anywhere — actually tested a draft strict CSP against all 10 pages using Playwright to inject it as a real response header and watching for genuine browser-reported violations, rather than just listing theoretical blockers. Found three real ones, all inside third-party library internals (ionicons' runtime-injected stylesheet, Swiper's embedded icon font, ionicons' per-icon SVG fetch) that reading the code never would have surfaced. Final policy verified at 0 violations on all 10 pages; written up in SECURITY_AUDIT.md with a `_headers.example` reference file (not deployed).

**Verified across all of the above**: axe-core 0 violations on all 10 pages (re-checked after each change); all pages serve HTTP 200 and load with zero console/page errors; Playwright screenshots confirm no unintended visual changes; the CSP policy was verified empirically, not just drafted.

**Branching note**: this phase's commits live on `feat/dummy-data-and-pagination`, branched from `main` after PR #2 (the Phase 1 + Phase 2 items 1-2 work) was merged. One commit was made directly to `main` by mistake before this was caught — moved to this branch and `main` reset back to match `origin/main` before continuing, so `main` was never actually ahead of what was reviewed and merged.

## 2026-11-27 session, continued: automated audits (Phase 2 item 2)

Ran axe-core (via Playwright `axe.run()` against the live DOM) and Lighthouse 13.6.0 against all 10 pages on localhost. Raw/summarized results in `reports/` (`axe-*.json`, `lighthouse-summary.md`). ACCESSIBILITY_AUDIT.md, PERFORMANCE_AUDIT.md, and QA_REPORT.md rewritten with real pass/fail numbers in place of "needs live testing."

**axe violations found and fixed** (16 violation-instances across 9 pages → 9, all one known issue):
- `index.html` had `</main>` with no matching open tag (it was commented out) — every section after the hero sat outside any landmark. Restored as `<main class="main-full-bleed">`; added a CSS override so the full-bleed hero layout is unaffected (verified 0px shift at 1440px — but a mobile-only `main { ... !important }` rule at ≤576px needed a `:not(.main-full-bleed)` addition too, since `!important` beats specificity; caught by a branch-vs-main screenshot diff at 375px, not by eyeballing a single breakpoint).
- `bike.html`'s image-slider section was similarly stuck outside `</main>`.
- `bike-shop.html` had no `<h1>` — added a visually-hidden one ("Our Fleet", matching the existing `<title>`, nothing fabricated).
- `bike.html` (`h1 > h3`) and `contact.html` (`h1 > h4`) both skipped heading levels — retagged to h2/h3, updated the matching SCSS tag selectors so styling didn't change.
- Decorative `ion-icon` elements (filter-outline dividers, 3 value-item icons on aboutus.html) get `role="img"` from ionicons' runtime JS with no label — added `aria-hidden="true"` to match the pattern already used on every other icon.
- Color contrast: `contact.html`'s form labels and `bike.html`'s `.unavailable-note` were inheriting the light-mode body color (`#333`) on dark backgrounds with no override at all — axe measured ~1.4-1.5:1 (need 4.5:1), i.e. barely legible. Fixed. The site's three brand reds used as text-on-dark (nav active state, prices, headings) also fail at 3.37-3.89:1 but weren't changed — that's a sitewide visible brand-color decision, flagged in ACCESSIBILITY_AUDIT.md for the client, not something to change unilaterally.

**Lighthouse-flagged performance fixes**: `index.html`'s first hero-slide image and `bike.html`'s product image had `loading="lazy"` despite being each page's primary above-the-fold content (PERFORMANCE_AUDIT.md previously and wrongly called this "not a real LCP risk" — corrected). Removed, added `fetchpriority="high"`. Same attribute added to `bike-shop.html`'s actual measured LCP element. Added `<link rel="preload" as="image" fetchpriority="high">` on aboutus/contact/blogs for their CSS-background LCP elements, which the browser can't discover without it.

**Verified**: Sass compiles; full branch-vs-`main` Playwright screenshot diff at 375/768/1440px re-run after all these changes — every remaining pixel difference traced to an intended fix (newly-visible form labels, brightened date text) or the pre-existing bike.html slider animation noise, nothing unexplained.

**Brand-red contrast — resolved 2026-11-27.** Client chose to fix only the failing text instances: introduced `#ff4d4d`, a WCAG-AA text-safe tint of the brand red (passes >=4.5:1 against every dark background in use), applied only where `#e50000`/`#e81938`/`#e81837` were used as small text on dark (nav active/hover state, map link, all prices, bike-spec heading, blog headings/links, legal-page links). Button backgrounds, borders, and large decorative headings keep the original brand reds. Verified: axe-core now reports **0 violations on all 10 pages** (down from 16 violation-instances at the start of this phase); branch-vs-main Playwright screenshot diff confirms only the intended text recolored.

**Not fixed, flagged for the client**: the aboutus/bike/bike-shop/blogs performance gap, which Lighthouse's own breakdown shows is dominated by unconditional third-party bundle weight (Bootstrap+Swiper+AOS+animate.css+Font Awesome+ionicons on every page), not images — same root cause PERFORMANCE_AUDIT.md already flagged as needing the icon-consolidation decision (Phase 2 backlog item 5), now confirmed by measurement rather than just inventory.

## 2026-11-27 session, continued: mobile nav accessibility (Phase 2 item 1)

**What changed** (`assets/js/script.js`): hamburger and dropdown toggles now sync `aria-expanded` with their actual open/close state (ACCESSIBILITY_AUDIT.md #2). Two adjacent bugs found and fixed while verifying this live:
- The hamburger (`.nav-toggle`, a `role="button"` div) had no keydown handler — Enter/Space did nothing, so it was unreachable by keyboard.
- The off-canvas `.nav-menu` is hidden via `right: -140%` (not display/visibility), so its links stayed focusable while off-screen. Now toggles the `inert` attribute on mobile widths only when closed; verified it does not affect desktop (nav-menu stays visible and non-inert at 1440px).

Escape now closes an open dropdown or the mobile panel and returns focus to the toggle that opened it.

Also moved a JS-injected `<style>` tag for `.scrolled` (missed by the Phase 1 grep since it's generated at runtime, not present in page source) into `navbar.scss` as `.navbar.scrolled`.

**Verified**: `node --check` on the edited file; live Playwright test at 375px confirmed `aria-expanded` and `inert` toggle correctly on click and on keyboard Enter, Escape closes and restores focus, dropdown `aria-expanded` syncs; a second Playwright run at 1440px confirmed `nav-menu` stays visible/non-inert on desktop; `npx sass main.scss main.css` still exits 0.

## 2026-11-27 session: inline CSS extraction (Phase 1 of a larger engagement)

**What changed**: removed every `<style>` block (10, one per page — skip-link CSS, plus `bike-shop.html` additionally had a `.sr-only` rule inline) and every `style="..."` attribute (22, not ~23 as previously estimated) from all 10 HTML pages. All of it now lives in SCSS:
- New `assets/css/a11y.scss` (skip-to-main + `.sr-only`), registered via `@use` in `main.scss`.
- `.footer-bottom` (shared across all pages), `.page-hero`, `.stats-section`, `.testimonial-section` background images, and the four legal pages' `.container` padding all moved onto their existing component selectors in `style.scss` — no new one-off classes needed. Two of the background-image rules (`.stats-section`, `.page-hero`) already had the exact line present but commented out in `style.scss`; this pass just uncommented/applied them.
- `contact.html`'s map iframe and `bike.html`'s `#bikeGalleryImage` use exact-match Bootstrap utilities (`border-0`, `w-100 h-auto`) instead of new SCSS, since those two are literal 1:1 matches and don't involve rem-based spacing.

**Verified**: `npx sass main.scss main.css` exits 0 with no deprecation warnings; `grep -rn 'style="'` and `grep -rn '<style'` across all HTML return zero; all 10 pages serve HTTP 200; visual parity checked with Playwright + pixelmatch (chromium, screenshots at 375/768/1440px, branch vs. a `main` git worktree) — 8 of 10 pages are pixel-identical at all three widths, and the two with non-zero diffs (`index.html`, `bike.html`) were confirmed to be animation-timing noise from pre-existing auto-playing sliders (a self-diff of the *same* branch page taken 1s apart showed ~8.5% pixel difference, far larger than the ~0.02%–3.7% branch-vs-main diff — i.e. the diff is the slider autoplaying between two screenshots, not a CSS regression). Keyboard-tested with Playwright: skip link is the first Tab stop on every page and `#main-content` exists exactly once per page.

**Doc corrections made by this pass**:
- A browser automation tool (Playwright, via `npx playwright install chromium`) **is** available in this environment, contradicting the "no browser tool available" caveat repeated throughout ACCESSIBILITY_AUDIT.md, PERFORMANCE_AUDIT.md, QA_REPORT.md, and item 3 below — those "needs live testing" caveats should be treated as stale, not current, for future work.
- `assets/css/style.css` / `style.css.map` are confirmed orphaned (not linked by any HTML, not needed by `main.scss`, which `@use`s `style.scss` directly) — flagged for the user to confirm deletion, not deleted.
- Noted during verification but pre-existing on `main` (not introduced by this pass, not fixed): the skip link's `:focus` CSS doesn't move it on-screen in a headless Chromium Tab test (`top` computed as `-166.875px` instead of `0` on both `main` and this branch) — worth a follow-up with real browser/VoiceOver testing, out of scope for a style-relocation pass.

## Completed earlier session (2026-11-26)

**Discovery**: Read all 10 HTML pages, all 5 SCSS partials, `script.js`, `package.json`, `README.md` in full. Confirmed repo structure via `find`. Confirmed jQuery's actual usage (zero) via grep before removing it. Confirmed no `robots.txt`/`sitemap.xml` existed. Confirmed no broken internal links across the whole site.

**Fixes implemented and verified**:
- `assets/js/bikes-data.js` (new) — single source of truth for all 10 bikes.
- `bike.html` — rewritten to be data-driven from `?slug=`; dead Swiper gallery markup replaced with a single dynamic image; related-bikes section now pulls from real inventory instead of a fabricated model.
- `bike-shop.html` — all 10 card links now carry `?slug=`; filter dropdowns corrected to match real brand/category data; results-count fallback text corrected.
- `assets/js/script.js` — filter/reset now updates the results toolbar; fixed duplicate `var testimonialSwiper` declaration; added `prefers-reduced-motion` guard around AOS init and both parallax scroll listeners; removed now-dead gallery Swiper init.
- `assets/css/main.scss` — fixed invalid `border: 1px solid v#e3e3e3` typo; added global `prefers-reduced-motion` override. Recompiled to `main.css` successfully both times.
- All 10 pages: unified footer-logo `alt` text brand name; removed unused jQuery `<script>` tag; added unique `<title>` + `<meta name="description">`; added `rel="noopener noreferrer"` to the Google Maps external link.
- `privacy-policy.html` — removed a stray `[cite: 3]` document-generation artifact.
- New files: `robots.txt`, `sitemap.xml` (domain is a clearly marked placeholder pending the real production domain).
- Documentation: `PROJECT_AUDIT.md`, `ACCESSIBILITY_AUDIT.md`, `PERFORMANCE_AUDIT.md`, `SEO_AUDIT.md`, `SECURITY_AUDIT.md`, `QA_REPORT.md`, `PRODUCTION_READINESS.md`, `FUTURE_ROADMAP.md` (this file).

**Verification performed**: Sass compiles cleanly; all 10 pages return HTTP 200 from a local static server; `bikes-data.js` parses and has unique slugs; every `bike-shop.html` card's slug matches a real `bikes-data.js` entry; no duplicate element IDs; no broken internal links (re-checked after all edits).

## Explicitly not done, and why (not oversights — see audit docs for full reasoning)

- No real browser/Lighthouse/axe-core/screen-reader testing — no browser automation tool was available in this session. All QA in this pass is static/scriptable verification; **QA_REPORT.md says exactly what was and wasn't tested.**
- Pagination on `bike-shop.html` left non-functional — inventory is small enough that it isn't needed yet; building fake pagination logic for 10 items wasn't a good use of the engagement.
- Hot-linked third-party images, placeholder phone/email/address, and bracketed legal placeholder values (deposit amount, refund SLA) were **not changed** — these require real business information that wasn't provided, and inventing numbers for a rental business's legal/contact terms would be actively harmful, not helpful.
- Icon-library consolidation (Font Awesome + ionicons both loaded) and CSS/JS splitting between marketing and legal pages — real wins, but structural changes that deserve their own isolated pass rather than being bundled into a correctness-focused session.
- SRI hashes on CDN scripts — mechanical but requires a version-pinning commitment; flagged, not done.
- `aria-expanded` not updated on mobile dropdown toggle — flagged in ACCESSIBILITY_AUDIT.md, not fixed (requires a small JS change plus live keyboard verification this session couldn't do).

## Exact next actions if resuming this work

1. Get real business info from the client: phone, email, address, security deposit policy numbers, refund SLA, production domain. This unblocks the largest number of remaining items across every audit doc.
2. Get real photography, or a decision to commission/license some, to replace every `demo2.wpopal.com` reference.
3. Run Lighthouse + axe-core against a deployed/locally-served copy once a browser tool or CI step is available — this turns PERFORMANCE_AUDIT.md and ACCESSIBILITY_AUDIT.md's "needs live testing" items into pass/fail results.
4. Decide on the contact-form honesty question (disclose that it opens WhatsApp, or build a real backend) and the pagination question (remove the dead markup, or build real pagination once inventory grows).
