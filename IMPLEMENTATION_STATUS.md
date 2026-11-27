# Implementation Status

Last updated: 2026-11-27.

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
