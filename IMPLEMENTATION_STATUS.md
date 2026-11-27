# Implementation Status

Last updated: 2026-11-27.

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
