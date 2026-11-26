# Accessibility Audit — Batmobilz Rentals

Target: WCAG 2.2 AA. Method: static code review of all 10 HTML pages and the compiled CSS/JS. **No browser, screen reader, or automated scanner (axe, Lighthouse) was run in this session** — there was no browser automation tool available in this environment. Everything below is derived from reading the markup/CSS/JS, not from live interaction testing. Treat the "Verified" items as code-level facts and the "Needs live testing" items as still open.

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
2. **Mobile dropdown (`has-dropdown`) toggle lacks `aria-expanded` state updates.** The `nav.js` toggles a `.active` class on click but never flips `aria-expanded` on the trigger link, so assistive tech is never told the submenu opened. The static `aria-expanded="false"` in the markup never changes.
3. **`iframe` map in `contact.html`** has a `title` and `aria-label`, which is good, but Google's embedded map `output=embed` src is a generic `q=India` query, not the real business address — functionally this means a screen reader (and sighted) user gets a map of the whole country, not the office. This is a data problem more than an accessibility one, but it undermines the a11y effort around it (see PROJECT_AUDIT.md — blocked on real address).
4. **Color contrast has not been numerically verified.** The primary brand red `#e81938` on white/black backgrounds, and placeholder text styled in that same red (`.form-control::placeholder { color: #e81938; }`), need an actual contrast-ratio check (4.5:1 for normal text) — this requires either a browser or a color-contrast calculation tool, neither of which ran in this session.
5. **Keyboard trap risk in the mobile nav has not been live-tested.** The hamburger menu sets `body.nav-open` and toggles overflow — whether Tab order stays logically contained and Escape closes it was not verified without a real browser.
7. **Heading hierarchy** looks mostly correct from a static read (each page has one `<h1>`, sections use `<h2>`/`<h3>` in order), but the profile-card markup on `aboutus.html`/`index.html` uses `<h2>Team Member</h2>` nested *inside* a page that already has other `<h2>`s for section titles at the same level — not a skipped level, but worth a sighted + screen-reader pass to confirm it doesn't read confusingly ("four people all literally named 'Team Member'" is itself a content quality issue, not just a11y — see PROJECT_AUDIT.md real-business-data gaps).

## Recommended next steps (not done in this pass — require either a browser tool or product sign-off)

- Run axe-core or Lighthouse accessibility audit in a real browser against all 10 pages.
- Manual keyboard walkthrough (Tab/Shift+Tab/Enter/Escape) of: mobile hamburger menu, dropdown, bike filter form, contact form, Swiper sliders' prev/next buttons.
- Screen reader pass (VoiceOver or NVDA) on the homepage hero slider and the bike-shop filter-then-results flow, since both involve content changing without a page reload.
- Add the `prefers-reduced-motion` guard (straightforward SCSS + a conditional in `script.js` before enabling AOS/parallax).
- Fix `aria-expanded` toggling on the mobile dropdown trigger.
