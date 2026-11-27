# QA Report — Batmobilz Rentals

Original caveat (2026-11-26): no browser automation tool was available that session; everything was static analysis. **That's no longer true as of 2026-11-27** — Playwright + Chrome for Testing is available in this environment and was used for real browser-based checks (visual screenshots, keyboard interaction, axe-core, Lighthouse). Items below are updated where re-verified; anything still marked "Not tested" genuinely wasn't covered by this session either, usually because it needs a real device/screen reader/multiple real browsers rather than headless Chromium.

## Automated / scriptable checks performed

| Test | Method | Result |
|---|---|---|
| Sass compiles without errors | `npx sass main.scss main.css` | ✅ Pass, both before and after every CSS change made in this pass |
| All internal `href`/local `src` paths resolve to real files | Extracted every local `href="*.html"` and `src="assets/*"` across all 10 pages, checked each against the filesystem | ✅ Zero broken links/assets found |
| No duplicate `id` attributes within a page | Scripted check per page | ✅ Clean on all 10 pages |
| All 10 pages serve HTTP 200 | `python3 -m http.server` + `curl` against every page, including `bike.html?slug=duke-390-2024` | ✅ All 200 |
| `bikes-data.js` is valid JS and every slug is unique | Node `vm` sandbox load + `Set` size check | ✅ 10 bikes, 10 unique slugs |
| Every `bike-shop.html` card's `?slug=` matches a real entry in `bikes-data.js` | Grep + cross-reference script | ✅ All 10 match exactly |
| jQuery usage | Grepped for `$(` across every JS file and inline `<script>` block | ✅ Confirmed zero usage before removing the `<script>` tag |
| Stray citation artifact / fabricated related-product ("Duke 250") | Full-text grep after fixes | ✅ Confirmed gone |
| Visual parity of CSS refactor (Phase 1: inline styles → SCSS) | Playwright screenshots at 375/768/1440px, branch vs. a `main` git worktree, pixelmatch diff | ✅ 8/10 pages pixel-identical at all 3 widths; the 2 with diffs (index.html, bike.html) traced to pre-existing autoplay sliders via a same-branch self-diff test, not a regression |
| Skip link is the first Tab stop; `#main-content`/landmark targets exist | Playwright keyboard test on all 10 pages | ✅ Confirmed on every page |
| Mobile nav: `aria-expanded` sync, keyboard activation, Escape-to-close, no off-canvas keyboard trap | Playwright at 375px (interaction) and 1440px (desktop regression check) | ✅ All pass — see IMPLEMENTATION_STATUS.md for what was actually broken and fixed |
| Accessibility (axe-core, WCAG 2a/2aa/2.2aa/best-practice rules) | Playwright + axe-core against all 10 pages | ✅ 0-1 violations per page after fixes (down from 16 violation-instances across 9 pages); only remaining violation is a flagged-not-fixed brand-color decision — see ACCESSIBILITY_AUDIT.md |
| Lighthouse performance/accessibility/best-practices/SEO | Lighthouse 13.6.0 against all 10 pages on localhost | ✅ Real scores in `reports/lighthouse-summary.md`: accessibility 96-100, best-practices 100, SEO 100, performance 71-96 |

## Functional review per page (code-level; not click-tested in a browser)

- **index.html** — Hero slider, info banner, blog teasers, testimonial slider, team section, stats counters, image slider, footer: all markup present and internally consistent after fixes. Hero images are hot-linked externally (see PERFORMANCE_AUDIT.md) — if that third-party host is down, this page will show broken images; **not verified live** in this session.
- **bike-shop.html** — Filter form now has dropdown options that match every bike's actual brand/category (fixed); results counter and "Page 1" toolbar text now update on filter/reset (fixed); every card links to the correct bike detail via `?slug=`. Pagination markup exists but is non-functional (documented as a known, deliberate non-fix in PROJECT_AUDIT.md). **Not tested in a live browser**: whether the Bootstrap grid reflows correctly at each breakpoint, whether the filter `<select>` dropdowns are reachable/operable via keyboard and touch.
- **bike.html** — Now renders per-bike content from `?slug=`, with a sensible fallback (`BIKES[0]`) if the parameter is missing or invalid, so the page never 404s or shows a blank state even with a bad/missing slug. Related-bikes section is generated from real inventory, excluding the current bike. WhatsApp button is disabled with an explanation when a bike is marked not-available. **Not tested in a live browser**: actual WhatsApp deep-link behavior, visual layout of the simplified single-image gallery versus the removed Swiper gallery's spacing assumptions in the SCSS (the SCSS still has gallery/thumbnail-slider rules that are now unused by this simplified markup — dead CSS, not a bug, but worth a visual check).
- **contact.html** — Form validation logic (required fields, email regex, consent checkbox) reads correctly; submission opens a WhatsApp link with the filled-in message rather than sending email (documented, not changed, in PROJECT_AUDIT.md item 15). Map iframe loads `https://maps.google.com/maps?q=India&output=embed` — functionally it will render a map, just not of the real office (no real address exists yet). **Not tested live.**
- **aboutus.html / blogs.html** — Static content pages, no interactive logic beyond the shared header/footer/slider scripts. Content reads consistently with the rest of the site after the brand-name fix.
- **pricing-policy.html / delivery-policy.html / privacy-policy.html / terms-condition.html** — All internal cross-links between these four pages (e.g., Terms linking to Pricing and Delivery policies) were checked and resolve correctly. `terms-condition.html` still contains two bracketed placeholder values (security deposit range, refund SLA days) that need real business figures before this is legally publishable — documented, not invented.

## Explicitly not tested

- ~~Visual rendering and responsive layout~~ **Partially done 2026-11-27** at 375/768/1440px via Playwright screenshots (see above) — the original brief's full 320px-1920px range wasn't swept, just these three representative breakpoints.
- ~~Keyboard-only navigation~~ **Done 2026-11-27 for the mobile nav** (see above). Bike filter form and Swiper prev/next buttons still not keyboard-tested.
- Screen reader behavior (VoiceOver/NVDA) — genuinely not testable from this environment (headless Chromium has no screen reader to drive).
- Cross-browser testing (Chrome/Firefox/Safari/Edge) — only Chromium was available; Firefox/Safari/Edge rendering differences are still unverified.
- ~~Lighthouse/axe-core automated scores~~ **Done 2026-11-27** — see above and `reports/`.
- Actual click-through of the WhatsApp deep links (can't open an external app/service from this sandboxed session).

## Net assessment

The structural/logical defects that were fixable by reading and correcting code have been fixed and verified by the scriptable checks above. The remaining open items are either (a) require a real browser/device to verify, (b) require real business information that wasn't provided, or (c) are deliberate product-scope decisions (pagination, icon-library consolidation) flagged for a follow-up rather than done opportunistically inside a bug-fix pass.
