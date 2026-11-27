# FUTURE_ROADMAP.md → phase mapping, and disagreements

Status: Phase 0 deliverable, awaiting approval.

## Mapping

| FUTURE_ROADMAP.md item | Covered by | Notes |
|---|---|---|
| Online booking — database | Phase 1 | `docs/data-model.md` supersedes the roadmap's sketch (`bikes, bookings, customers, payments`) with the full schema (adds `bike_images`, `bike_blocks`, `refunds`, `business_config`, `audit_log`) |
| Online booking — API, conflict prevention | Phase 1 (read) + Phase 3 (write/hold) | Conflict prevention is the `EXCLUDE USING gist` constraint, not app-code locking |
| Online booking — payment gateway | Phase 4 | Razorpay, test mode only, per DECISIONS |
| Online booking — security considerations (PCI scope) | Phase 4 | Resolved by never touching card/UPI data — Razorpay Checkout.js handles that directly, out of this system's PCI scope entirely |
| Admin dashboard for inventory management | Phase 5 | Roadmap's "view of upcoming reservations per bike" folded into the bookings list/filter UI |
| User login and booking history | Phase 2 (login) + Phase 6 (history) | Roadmap assumed "hashed passwords" — superseded by the no-password OTP decision, which removes that specific risk category rather than mitigating it |
| Backend integration generally | Phase 1 / ADR 0001 | Supabase chosen; see ADR for why Node/Express and Firebase/Mongo were ruled out |
| Real pagination on `bike-shop.html` | **Already shipped**, not part of this mission | See "Pre-empted items" below |
| Splitting shared CSS/JS by page type | **Not in scope of this mission at all** | Stays deferred; this mission is backend/booking, not a frontend-performance pass |
| SRI hashes on CDN scripts | **Already shipped**, not part of this mission | See "Pre-empted items" below |

## Pre-empted items — needs your decision before Phase 1

Since FUTURE_ROADMAP.md was last read by a prior session, two of its "smaller, deferred" items were actually built on an **unmerged** branch, `feat/dummy-data-and-pagination` (10 commits ahead of `main`, pushed to origin, not yet merged):

- Real pagination (18 bikes, not the 10 `main` currently has) — done.
- SRI hashes + exact CDN version pinning — done.
- Also on that branch, not in the roadmap at all: Font Awesome → ionicons consolidation, a strict CSP draft (empirically verified, 0 violations), and sitewide placeholder→dummy-data replacement (phone/email/address/domain/team names/legal values), per your explicit instruction in that session that this is a learning project, not a real business.

**This directly affects Phase 1**, which says "seed `bikes` from the current `assets/js/bikes-data.js`": `main`'s version has 10 bikes with the original placeholder data; the unmerged branch's version has 18 bikes with your dummy data already applied. Seeding from the wrong one means re-doing it later. **I'd recommend merging `feat/dummy-data-and-pagination` into `main` first** — it's fully tested (axe-core 0 violations across all 10 pages, Playwright-verified, already reported to you in detail) — so Phase 1 has one single, current source of truth to seed from. I won't merge it without you saying so (hard rule). If you'd rather keep it unmerged for now, tell me which `bikes-data.js` (10-bike `main` or 18-bike branch) to seed from instead.

## Other disagreements / things worth flagging

1. **Docker is not installed on this machine** (no `docker`, no Docker Desktop, no colima/podman) — see ADR 0001. Phase 1's acceptance criteria require `supabase db reset` and a pgTAP suite running locally, both of which need Docker. This blocks Phase 1 starting as literally written until one of: Docker gets installed here, migrations get authored here but run/tested on your machine, or work points at a real (not local) Supabase project instead — the last option needs a real project's credentials, which I won't invent or ask you to hand over casually given the "never touch production" hard rule; a throwaway dev-tier Supabase project would be the reasonable middle ground if you want to unblock this without installing Docker.
2. **Native `<input type="date">` pairs** (Phase 3's stated UI preference) will render with each browser's default date-picker chrome, which won't match this site's dark, heavily-custom-styled design (SCSS throughout, no existing date-input styling anywhere in the codebase). Not a blocker — native inputs are the right accessibility default — but flagging now so the visual mismatch isn't a surprise later; a styled custom date-range pattern is the alternative but needs its own accessibility verification (axe + keyboard) to be worth the trade.
3. **Verified, no disagreement**: the 21+/licence/government-ID-category eligibility rules in `terms-condition.html` and the >24h/≤24h/no-show-4h refund rules in `pricing-policy.html` match exactly what the DECISIONS table describes — confirmed by reading both files, not assumed.
4. **"Booking should come after placeholder business data is finalized"** (the roadmap's original priority note) is satisfied differently than it originally envisioned: real business data was never provided, but you've since explicitly authorized realistic dummy data in place of it for this non-production learning project. Worth a one-line update to FUTURE_ROADMAP.md reflecting that, once the dummy-data branch is merged.
