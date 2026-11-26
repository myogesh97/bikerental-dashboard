# Performance Audit — Batmobilz Rentals

Method: static inspection of network dependencies, asset sizes on disk, and JS execution patterns. **No Lighthouse/WebPageTest run was performed** — no browser automation tool was available in this session, so there are no measured LCP/INP/CLS numbers here, only structural findings and their likely impact. Treat the Core Web Vitals targets in the original brief as aspirational until someone runs Lighthouse against a deployed copy.

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
- `loading="lazy"` is used consistently on below-the-fold slider images; the hero slider's first image is not marked `loading="eager"` explicitly, but since it's the very first thing in the DOM this is a minor point, not a real LCP risk by itself.
- No responsive `srcset`/`sizes` anywhere — every image ships one resolution to every device, including mobile.

## JavaScript execution patterns

- `script.js` previously registered **two separate** `scroll` listeners for the hero parallax (one for background transform, one for text transform), each re-querying `.hero-bannerSection .swiper-slide` and iterating all slides on every scroll event, unthrottled. Both still exist (now behind a `prefers-reduced-motion` guard added in this pass — see ACCESSIBILITY_AUDIT.md), but on pages where motion isn't reduced, this remains two unthrottled scroll handlers doing redundant DOM queries. Not fixed — merging them into one handler and adding `requestAnimationFrame` throttling would be the next step, but it's a behavior-preserving refactor that deserves its own isolated change rather than being bundled into the correctness fixes in this pass.
- The counter animation (`animateCounter`) uses `setTimeout` recursion rather than `requestAnimationFrame` — works, but isn't frame-synced. Low priority.
- `updateListingToolbar()` now runs correctly after every filter/reset (fixed — see PROJECT_AUDIT.md) and only queries `.motorcycle-card` — cheap, not a performance concern even at larger inventory sizes.

## What this means for Core Web Vitals (unverified estimate, not measured)

- **LCP**: likely dominated by the hot-linked hero image from a third-party host — bringing that in-house (local, correctly sized, WebP) is the single highest-leverage fix once real photography exists.
- **CLS**: no obvious layout-shift red flags in the markup (images don't have explicit `width`/`height` attributes, which *can* cause shift, but Bootstrap's `img { max-width: 100% }` plus CSS-driven aspect boxes in the SCSS may already constrain this — would need live measurement to confirm either way).
- **INP**: the unthrottled scroll listeners are the most plausible contributor; not large on a page this simple, but worth fixing before they're copy-pasted into more pages.

## Recommended next steps (require a browser / build step this session didn't have)

1. Run Lighthouse against a deployed or locally-served copy of each page to get real LCP/INP/CLS numbers before optimizing further by guesswork.
2. Decide on and execute an image strategy: license/commission real photography, host it locally, serve WebP with `srcset`.
3. Trim the icon-library overlap (pick one of Font Awesome / ionicons, not both).
4. Throttle or merge the two scroll-parallax listeners with `requestAnimationFrame`.
