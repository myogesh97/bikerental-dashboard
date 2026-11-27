# Performance Audit — Batmobilz Rentals

Original method (2026-11-26): static inspection only, no browser tool available. **Updated 2026-11-27**: Lighthouse 13.6.0 run against all 10 pages on localhost via Playwright's Chrome for Testing — real scores and Core Web Vitals numbers now exist in `reports/lighthouse-summary.md`, replacing the estimates below. Localhost + Lighthouse's default simulated throttling are not representative of production hosting; treat these as directional until measured against a real deploy.

## Real numbers (2026-11-27, after this session's fixes)

Performance scores range 71-96; accessibility 96-100; best-practices and SEO are 100 on every page. Full table in `reports/lighthouse-summary.md`. Two clusters emerged:

- **Legal pages + index.html (94-96 performance)**: LCP is either CSS/text-based or fixed with `fetchpriority="high"` this session — nothing obvious left to fix without a hosting/CDN change.
- **aboutus/bike/bike-shop/blogs (71-76 performance, LCP 5.9-9.2s)**: fixed the per-image issues (see below) but the bulk of the gap traces back to the same unconditional CDN bundle weight described below (Bootstrap+Swiper+AOS+animate.css+Font Awesome+ionicons on every page) — confirmed by Lighthouse's own LCP-breakdown audit showing the measured resource-load subparts sum to under 1 second even on bike-shop.html, meaning the gap is in render-blocking work, not image loading. The icon-consolidation / bundle-splitting item below is the real fix, not a per-page patch.

**Fixed this session**: `index.html`'s first hero-slide image and `bike.html`'s product image were `loading="lazy"` despite being each page's primary above-the-fold content (a real bug, not the "minor point" this doc previously claimed — see the old note under Images below, now corrected); removed and replaced with `fetchpriority="high"`. Same attribute added to `bike-shop.html`'s actual measured LCP element (first inventory card image). `aboutus.html`/`contact.html`/`blogs.html` have a CSS `background-image` as their LCP element, which the browser's preload scanner can't discover from the initial HTML — added `<link rel="preload" as="image" fetchpriority="high">` for each.

## Dependency load on every single page

Every one of the 10 pages loads, from CDNs, unconditionally:

- Google Fonts (Noto Sans + Teko)
- Swiper CSS + JS (`swiper@11` bundle)
- AOS CSS + JS
- animate.css (full 4.1.1 minified)
- Bootstrap 5 CSS + JS bundle
- Font Awesome via a kit script (`kit.fontawesome.com/7c61365257.js`)
- ionicons (ESM + nomodule fallback — two versions of the same icon library shipped together)
- `assets/css/main.css` (local)
- `assets/js/script.js` (local)

That's three icon systems (Font Awesome, ionicons, and Bootstrap's bundled icon-adjacent JS) on a 10-page static site. Pages like the legal/policy pages (`privacy-policy.html`, `terms-condition.html`) use almost none of this — no sliders, no AOS animation targets, no icon-heavy content beyond the shared header/footer — but still pay the full download/parse cost.

**Fixed this pass:** removed jQuery (confirmed zero usage) from all 10 pages — one fewer blocking `<script>` tag everywhere, no functional loss.

**Not fixed (needs a product/design decision, not a quick patch):** consolidating to one icon library, and/or splitting "marketing page" CSS/JS (sliders, AOS, parallax) from "content page" CSS/JS (legal pages) so the latter don't pay for the former. This is a real win but changes the build structure — flagged for a follow-up pass rather than done silently in the same change as the bug fixes above.

## Images

- Hero/banner/team/testimonial photography is hot-linked from `demo2.wpopal.com` (a third-party template demo site) rather than hosted in `assets/images/`. This is a performance *and* reliability risk: load time depends on a server Batmobilz doesn't control, and if that demo site is ever taken down, those images 404 in production. See PRODUCTION_READINESS.md.
- Bike photography (`assets/images/bikes/bike-*.jpg`) is hosted locally — good — but has not been checked for appropriate sizing/compression (no browser tool to measure actual rendered-vs-natural pixel dimensions in this session).
- ~~`loading="lazy"` is used consistently on below-the-fold slider images; the hero slider's first image is not marked `loading="eager"` explicitly, but since it's the very first thing in the DOM this is a minor point, not a real LCP risk by itself.~~ **This was wrong — corrected 2026-11-27.** The hero slider's first image, and `bike.html`'s above-the-fold product image, actually had `loading="lazy"` explicitly set, which does delay the browser's fetch of exactly the element Lighthouse measures as LCP. Fixed — see above.
- No responsive `srcset`/`sizes` anywhere — every image ships one resolution to every device, including mobile.

## JavaScript execution patterns

- `script.js` previously registered **two separate** `scroll` listeners for the hero parallax (one for background transform, one for text transform), each re-querying `.hero-bannerSection .swiper-slide` and iterating all slides on every scroll event, unthrottled. Both still exist (now behind a `prefers-reduced-motion` guard added in this pass — see ACCESSIBILITY_AUDIT.md), but on pages where motion isn't reduced, this remains two unthrottled scroll handlers doing redundant DOM queries. Not fixed — merging them into one handler and adding `requestAnimationFrame` throttling would be the next step, but it's a behavior-preserving refactor that deserves its own isolated change rather than being bundled into the correctness fixes in this pass.
- The counter animation (`animateCounter`) uses `setTimeout` recursion rather than `requestAnimationFrame` — works, but isn't frame-synced. Low priority.
- `updateListingToolbar()` now runs correctly after every filter/reset (fixed — see PROJECT_AUDIT.md) and only queries `.motorcycle-card` — cheap, not a performance concern even at larger inventory sizes.

## What this means for Core Web Vitals (measured 2026-11-27, see table above)

- **LCP**: confirmed dominated by the hot-linked hero/background images on the slower pages, plus unconditional third-party bundle weight — see "Real numbers" above. Bringing images in-house (local, correctly sized, WebP) remains the single highest-leverage fix once real photography exists.
- **CLS**: measured 0.004-0.029 across all pages — all well under the 0.1 "good" threshold. No fix needed.
- **TBT**: measured 0-120ms across all pages — well under the 200ms "good" threshold. The unthrottled scroll listeners are a code-quality concern more than a measured performance problem right now.

## Recommended next steps

1. ~~Run Lighthouse against a deployed or locally-served copy~~ **Done 2026-11-27** — see above.
2. Decide on and execute an image strategy: license/commission real photography, host it locally, serve WebP with `srcset`.
3. Trim the icon-library overlap (pick one of Font Awesome / ionicons, not both) — now confirmed by measurement, not just inventory, to be the dominant remaining performance lever on aboutus/bike/bike-shop/blogs.
4. Throttle or merge the two scroll-parallax listeners with `requestAnimationFrame`.
