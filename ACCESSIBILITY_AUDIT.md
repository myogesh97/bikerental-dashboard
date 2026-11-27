# Accessibility Audit — Batmobilz Rentals

Target: WCAG 2.2 AA. Original method (2026-11-26): static code review only, no browser tool available. **Updated 2026-11-27**: axe-core (via Playwright + Chromium, `axe.run()` against the live DOM, not a static read) was run against all 10 pages on localhost; raw results in `reports/axe-*.json`, Lighthouse accessibility scores in `reports/lighthouse-summary.md`. Sections below are now split into what's been live-verified vs. what's still a static-read claim.

## Automated scan results (axe-core, 2026-11-27, after this session's fixes)

**0 violations on all 10 pages.** Lighthouse accessibility scores 96-100 (the sub-100 pages were held back entirely by the now-fixed color-contrast issue; see `reports/axe-*.json` and `reports/lighthouse-summary.md`).

Before this session's fixes, the same scan found 16 violation-instances across 9 pages: missing/malformed landmarks (`index.html` had no `<main>` at all — the opening tag was commented out but the closing tag wasn't, so every post-hero section sat outside any landmark), a missing `<h1>` on `bike-shop.html`, heading-order skips on `bike.html` and `contact.html`, unlabeled decorative `ion-icon` elements, and color-contrast failures. All fixed.

### Color-contrast fix detail

Two sub-categories:
- **Genuinely broken**: `contact.html`'s form labels (`.form-label`) and `bike.html`'s `.unavailable-note` were inheriting the light-mode body color (`#333`) with zero dark-background override — axe measured ratios of ~1.4:1 and ~1.5:1 (WCAG AA needs 4.5:1), i.e. close to invisible. Fixed by giving them an explicit light color already used elsewhere on dark backgrounds in this codebase.
- **Brand color used as text on dark**: the site's three brand reds (`#e50000`, `#e81938`, `#e81837`) used as *text* color on dark backgrounds (`#1a1a1a`/`#111111`/`#252525`) measured 3.37-3.89:1. This showed up on the active/hover nav-link state, the footer map link, every price, the bike-spec-sheet heading, blog post headings/in-body links, and legal-page in-body links. Per the client's direction, introduced a single `#ff4d4d` "text-safe" tint (passes >=4.5:1 against all three backgrounds in use) used only for these text instances — button backgrounds, borders, and large decorative headings keep the original brand reds unchanged. Verified with a branch-vs-main Playwright screenshot diff that only the intended text recolored.

## What's already in place (verified by reading the markup)

## What's already in place (verified by reading the markup)

- `<a class="skip-to-main">Skip to main content</a>` present on every page, visually hidden until focused, jumping to `#main-content`.
- Icon-only links (social icons, scroll-to-top, map link, nav toggle) all carry `aria-label`.
- `role="navigation"`/`aria-label="Main navigation"` on the nav menu; breadcrumbs use `<nav aria-label="breadcrumb">` with `aria-current="page"`.
- Dynamic content has live regions: results count (`role="status" aria-live="polite" aria-atomic="true"`), animated stat counters (`aria-live="polite"` + a static `aria-label` describing what's counting).
- A global, visible focus style exists: `outline: 2px dotted #afafaf; outline-offset: 3px;` on `:focus-visible` for links, buttons, inputs, and custom components (`main.scss` lines ~113–132) — native outlines are not simply removed, they're replaced with something visible.
- Form fields in `contact.html` have real `<label for>` associations, `aria-required="true"`, and `autocomplete` attributes.
- `bike-shop.html`'s filter `<select>` elements have visually-hidden-but-accessible `<label>`s (`.sr-only`) plus redundant `aria-label` — belt-and-suspenders, acceptable.
- Decorative icons consistently get `aria-hidden="true"` (Font Awesome `<i>` tags, ionicons) — spot-checked across pages, no stray unlabeled icon-as-content found.

## Fixed in this pass

- Footer logo `alt` text was a different, inconsistent brand name ("Lex Rider Motorcycle Club Logo") from everything else on the page — a screen reader user heard two unrelated company names describing what should be one logo. Unified to "Batmobilz Rentals - Home" sitewide.
- `bike.html`'s detail content is no longer a static mismatch between the visible bike card you clicked and the page that loads — this matters for accessibility too, since a screen reader user relying on the page title/heading to confirm they're on the right bike was previously told the wrong name every time.
- Added a global `prefers-reduced-motion: reduce` CSS override (collapses all animation/transition durations to effectively zero and disables smooth scroll) in `main.scss`, and guarded AOS init (`disable: prefersReducedMotion`) and the two scroll-driven parallax transforms in `script.js` behind the same check. Previously every animation ran unconditionally regardless of the user's OS-level motion preference.
- While removing the now-dead Swiper gallery initialization from `script.js` (the `.gallery-slider`/`.gallery-thumbs` elements it targeted no longer exist after the bike.html data-driven rewrite), also removed that dead code rather than leaving it silently doing nothing.

## Open issues (found in code, need live verification + fixing)

1. **Disabled WhatsApp button has no explained reason.** `bike.html`'s "Contact us" button gets a plain `disabled` attribute when a bike is `not-available`, with explanatory text in a separate `<p>` below it. A screen reader encountering the disabled button alone won't necessarily reach that paragraph in the same breath. Should tie them together with `aria-describedby`.
2. ~~**Mobile dropdown (`has-dropdown`) toggle lacks `aria-expanded` state updates.**~~ **Fixed 2026-11-27.** Both the hamburger (`.nav-toggle`) and the `.has-dropdown` trigger link now flip `aria-expanded` on open/close in `script.js`. While fixing this, also found and fixed two adjacent bugs verified live with Playwright: the hamburger (`role="button"` div, no native semantics) had no keydown handler at all, so it was unreachable via keyboard; and the off-canvas `.nav-menu` was hidden only via `right: -140%` (not display/visibility), so its links stayed in the Tab order while invisible — a keyboard-trap-adjacent bug. Both fixed; the menu now also toggles `aria-expanded`/`inert` correctly and Escape closes it and returns focus to the toggle. See IMPLEMENTATION_STATUS.md.
3. **`iframe` map in `contact.html`** has a `title` and `aria-label`, which is good, but Google's embedded map `output=embed` src is a generic `q=India` query, not the real business address — functionally this means a screen reader (and sighted) user gets a map of the whole country, not the office. This is a data problem more than an accessibility one, but it undermines the a11y effort around it (see PROJECT_AUDIT.md — blocked on real address).
4. ~~**Color contrast has not been numerically verified.**~~ **Verified and fixed 2026-11-27 with axe-core** — see "Automated scan results" above.
5. ~~**Keyboard trap risk in the mobile nav has not been live-tested.**~~ **Verified and fixed 2026-11-27** with Playwright — see item 2 above.
6. **Skip-link focus doesn't visibly move the link on-screen in headless Chromium.** Found while verifying Phase 1 (inline-CSS extraction): `getComputedStyle(skipLink).top` stays non-zero after Tab-focusing it, on both `main` and the refactor branch — confirmed pre-existing, not introduced by that pass. Needs a real-browser + screen-reader check to see whether this reproduces outside headless Chromium before treating it as a bug.
7. **Heading hierarchy** — ~~looks mostly correct from a static read~~ **axe-verified 2026-11-27**: `bike.html` (`h1 > h3`, spec-sheet heading skipped h2) and `contact.html` (`h1 > h4`, three info-block headings skipped h2/h3) both had real skips; fixed by retagging to h2/h3 and updating the matching SCSS selectors so styling is unchanged. `bike-shop.html` had no `<h1>` at all (axe: `page-has-heading-one`); added a visually-hidden one (`Our Fleet`, matching the existing `<title>`) since this page's design has no visible page-title area and nothing was fabricated. The `aboutus.html`/`index.html` `<h2>Team Member</h2>` repetition noted below is a content-quality observation, not a structural a11y violation — axe doesn't flag it, and it's unchanged.

Still true, not re-verified: the profile-card markup on `aboutus.html`/`index.html` uses `<h2>Team Member</h2>` nested inside a page that already has other `<h2>`s for section titles at the same level — worth a sighted + screen-reader pass to confirm it doesn't read confusingly (see PROJECT_AUDIT.md real-business-data gaps).

## Recommended next steps

- ~~Run axe-core or Lighthouse accessibility audit~~ **Done 2026-11-27** — see above.
- ~~Decide on the brand-red color-contrast fix~~ **Done 2026-11-27** — see above.
- Manual keyboard walkthrough on a **real** browser/OS (this session only verified with headless Chromium via Playwright, not a real device): mobile hamburger menu, dropdown, bike filter form, contact form, Swiper sliders' prev/next buttons.
- Screen reader pass (VoiceOver or NVDA) on the homepage hero slider and the bike-shop filter-then-results flow, since both involve content changing without a page reload — axe can't catch everything a real AT user would hit.
- Investigate the skip-link focus finding (item 6) on a real browser.
- Tie the disabled WhatsApp button to its explanation with `aria-describedby` (item 1).
