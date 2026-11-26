# Project Audit — Batmobilz Rentals Bike Rental Website

Date: 2026-11-26
Scope: Full repository inspection (not limited to the 4 pages named in README).

## 1. What this project actually is

A 10-page static site (no backend, no build pipeline beyond Sass compilation):

- `index.html` — homepage
- `bike-shop.html` — inventory grid with client-side filtering
- `bike.html` — bike detail page (now data-driven, see §3)
- `contact.html` — contact form (opens WhatsApp, does not send email)
- `aboutus.html`, `blogs.html` — content pages
- `pricing-policy.html`, `delivery-policy.html`, `privacy-policy.html`, `terms-condition.html` — legal pages

Stack: HTML5, SCSS → `assets/css/main.css`, vanilla JS (`assets/js/script.js`), Bootstrap 5, Swiper, AOS, animate.css, Font Awesome (via kit script), ionicons, Google Fonts — all loaded from CDNs. jQuery was also loaded on every page but **never used anywhere in the codebase** (confirmed by grepping for `$(` across all JS and inline scripts) — it has been removed (§3).

The business name used consistently in all legal text, contact details and the nav logo alt text is **"Batmobilz Rentals"**, based in Guwahati, Assam. The site is built on top of a repurposed "LexRider" template (images still hot-linked from `demo2.wpopal.com/lexrider/...`, and the footer logo's `alt` text said "Lex Rider Motorcycle Club Logo" on every page before this audit — fixed, see §3).

## 2. Confirmed defects (evidence-based, found by reading the code)

| # | Defect | Evidence | Severity |
|---|---|---|---|
| 1 | Every bike card's "Details" link went to the same static `bike.html`, which always showed one hardcoded bike ("Interceptor (2025)") regardless of which of the 10 cards was clicked. | `bike-shop.html` had 10 identical `href="bike.html"` links; `bike.html` had static markup, not driven by any identifier. | **Critical** — core shopping flow was broken. Fixed. |
| 2 | `bike.html`'s "related bikes" section listed a model ("Duke 250 (2024)") that does not exist anywhere in the inventory. | Static markup in old `bike.html`. | High — fabricated inventory. Fixed. |
| 3 | Filtering on `bike-shop.html` never updated the "Displaying X of Y" toolbar text after a filter/reset was applied — it stayed at its initial (also wrong) value. | `script.js` `filterBikes()`/reset handler didn't call `updateListingToolbar()`. | Medium. Fixed. |
| 4 | Filter `<select>` dropdowns only offered 3 brands (Royal Enfield, Yamaha, KTM) and 4 categories (sport/cruiser/racer/retro), but the actual card data used 7 brands (including hero, jawa, tvs, bajaj) and had every single card mis-tagged `category="sport"` regardless of real bike type. Selecting a brand like "Royal Enfield" + category "cruiser" would hide bikes that should match, and several bikes (Hero Xpulse, Jawa Perak, TVS Apache, Bajaj Dominar) couldn't be found by brand filter at all. | Compared dropdown `<option>` values against card `data-brand`/`data-category` attributes. | High — "filtering must actually work" was not true. Fixed (dropdowns + categories corrected to real values; added "adventure" category). |
| 5 | Pagination container (`#paginationContainer`) exists in the DOM but is never populated by any script — it's a dead, empty element. | Grepped for `paginationContainer` — only referenced in HTML, never in JS. | Medium. **Not fixed** — see §4 (requires a product decision: real pagination vs. "show all 10" is reasonable at this catalog size). |
| 6 | Invalid CSS: `border: 1px solid v#e3e3e3;` (stray `v` before the hex color) in `.form-control`. | `assets/css/main.scss:150`. | Medium — form inputs render with the browser's default border instead of the intended one. Fixed. |
| 7 | `script.js` declared `var testimonialSwiper` twice (once for the testimonial slider, once for the image-only slider), silently discarding the first variable. No functional bug today (neither variable is reused later) but it's a real "two different things sharing one name" footgun. | `assets/js/script.js`. | Low. Fixed (renamed second to `imageOnlySwiper`). |
| 8 | Footer logo `alt` text said "Lex Rider Motorcycle Club Logo" on **every page**, while the nav logo `alt` said "Batmobilz Rentals - Home" and all legal/contact copy says "Batmobilz Rentals". Two brand names for one business, visible to screen reader users on every page. | Sitewide grep. | Medium (brand consistency + accessibility). Fixed sitewide. |
| 9 | `privacy-policy.html` contained a leftover AI/document-generation citation artifact: `"...Rider Eligibility terms[cite: 3]."` visible in rendered text. | Line 217 (pre-fix). | Low but embarrassing in a legal document. Fixed. |
| 10 | No page had a meta description; `index.html`, `aboutus.html`, `blogs.html` all shared the generic `<title>Bike Rental</title>`. | Grepped all `<title>` tags. | Medium (SEO). Fixed — see SEO_AUDIT.md. |
| 11 | No `robots.txt`, no `sitemap.xml`. | `ls` confirmed absence. | Medium (SEO). Added — see SEO_AUDIT.md for the domain placeholder that still needs replacing. |
| 12 | Hero/banner/team/testimonial images across `index.html`, `aboutus.html` are hot-linked to a third party (`demo2.wpopal.com`), not hosted locally. | Grepped `src="https://demo2.wpopal.com`. | High for production reliability — see PRODUCTION_READINESS.md. **Not fixed** (no replacement photography provided; fabricating stock imagery wasn't appropriate either). |
| 13 | `bike-shop.html` claims "Bikes in Fleet: 18" (stats section) but only 10 bikes are listed in the shop grid. Not necessarily wrong (fleet could exceed the online catalog) but it's an unexplained mismatch worth confirming with the business. | Compared stats counter to card count. | Low — flagged, not changed (business fact, not something to invent/alter). |
| 14 | `terms-condition.html` contains bracketed template placeholders left in a legal document: `[e.g., ₹5,000 to ₹15,000, depending on the bike]` and `[e.g., 7 working days]`. | Lines in Terms & Conditions. | High for legal/production readiness. **Not fixed** — these are real business decisions (security deposit amount, refund SLA) that must come from the business, not be invented. Documented as a blocker in PRODUCTION_READINESS.md. |
| 15 | Contact form's button says "Send Message" and the section header says "SEND US A MESSAGE", but no email is ever sent — submitting opens a WhatsApp chat with the message pre-filled. This is not disclosed to the user before they fill out the form. | `contact.html` inline script. | Medium — honesty/UX issue per the "must not pretend to send messages" rule. **Not fixed yet** — recommend adding a one-line disclosure under the form; left for product sign-off since it changes visible copy on a legal-adjacent form. |

## 3. What was fixed in this pass

- Made `bike.html` genuinely data-driven: added `assets/js/bikes-data.js` (single source of truth for all 10 bikes — name, brand, category, availability, price, and real, publicly documented specs for each actual motorcycle model, e.g. a Royal Enfield Classic 350's 349cc single-cylinder engine). `bike-shop.html` cards now link to `bike.html?slug=<bike-slug>`; `bike.html` reads the slug and renders that bike's real name, price, status, specs, and three *other* real bikes as "related" — no more fabricated or wrong bike shown.
- Fixed the filter/toolbar desync, the dropdown-vs-data mismatch (added missing brand options, corrected every card's category, added an "adventure" category), and the invalid CSS border declaration.
- Unified the brand name in `alt` text across all 10 pages to "Batmobilz Rentals".
- Removed the stray citation artifact from the privacy policy.
- Removed unused jQuery from all 10 pages (confirmed zero usage first).
- Added unique `<title>` and `<meta name="description">` to every page.
- Added `robots.txt` and a `sitemap.xml` (domain is a placeholder — see SEO_AUDIT.md).
- Verified the Sass build still compiles cleanly (`npx sass main.scss main.css`) and all 10 pages still return HTTP 200 from a local static server after every change.

## 4. What was deliberately NOT fixed, and why

- **Pagination** — left as a dead element rather than building fake pagination logic for 10 items that don't need paging. Recommend either removing the markup or wiring it up once inventory grows past one page's worth of cards (see FUTURE_ROADMAP.md).
- **Hot-linked demo images** — can't be fixed without either real business photography or a licensed stock source; inventing one would misrepresent the business. Documented as a production blocker.
- **Legal placeholder values** (security deposit range, refund SLA days) — these are real business decisions, not implementation details. Left untouched rather than guessed.
- **Contact form honesty disclosure** — a copy/content change on a form tied to legal terms; flagged rather than changed unilaterally.
- **"Bikes in Fleet: 18" vs. 10 listed** — a business-fact question, not a code bug to silently alter.

## 5. Everything else inspected and found sound

- No broken internal links or missing local assets (`href`/`src` checked against the filesystem — zero misses).
- No duplicate element `id`s across any page.
- Reasonable existing accessibility baseline already present before this audit: skip-to-content link, `aria-label`s on icon-only links, `aria-live` regions on dynamic counters/results, visible focus-ring CSS (`:focus-visible` with dotted outline), semantic `<nav>`/`<main>`/`<address>` usage. See ACCESSIBILITY_AUDIT.md for what's still missing.
- SCSS is organized into sensible partials (`style`, `navbar`, `bike`, `responsive`) under one `main.scss` entry — no architectural rework needed for a site this size.

See the companion documents for accessibility, performance, SEO, security, QA, production-readiness, and roadmap detail: `ACCESSIBILITY_AUDIT.md`, `PERFORMANCE_AUDIT.md`, `SEO_AUDIT.md`, `SECURITY_AUDIT.md`, `QA_REPORT.md`, `PRODUCTION_READINESS.md`, `FUTURE_ROADMAP.md`, `IMPLEMENTATION_STATUS.md`.
