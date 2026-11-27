# Security Audit — Batmobilz Rentals

Scope note: this is a static frontend site with no backend, no authentication, and no server-side code of any kind. Most of the OWASP Top 10 (SQL injection, broken access control, server-side request forgery, etc.) doesn't apply because there's no server-side attack surface. What follows is what *does* apply to a client-only site.

## Findings

| # | Finding | Risk | Status |
|---|---|---|---|
| 1 | No secrets, API keys, or credentials found anywhere in the repository (grepped all HTML/JS/SCSS/JSON). The Font Awesome "kit" script embeds a kit ID (`7c61365257`) in its URL — this is a public CDN token by design (Font Awesome kits are meant to be embedded client-side), not a secret. | None | Verified clean. |
| 2 | `bike.html`'s dynamic rendering (new in this pass) builds HTML via template strings (`innerHTML = ...`) using data from `assets/js/bikes-data.js`. That data is a static, developer-controlled array, not user input, so there's no injection vector there. The one piece of user-influenced input is the `?slug=` URL parameter, but it's only ever used as a lookup key against `BIKES.find(b => b.slug === slug)` — never concatenated into HTML or passed to `eval`/`innerHTML` directly. An attacker controlling `slug` can at most cause the page to fall back to showing the first bike (`BIKES[0]`); they cannot inject markup or script. | None exploitable | Verified by design review of the new code. |
| 3 | The contact form (`contact.html`) and bike-detail "Contact us" button both build a `wa.me` WhatsApp deep link from user-entered text (`name`, `email`, `message`) via `encodeURIComponent`. Proper encoding is used, so this is not an injection vector into the URL itself. | Low | No change needed. |
| 4 | None of the third-party CDN `<script>`/`<link>` tags used Subresource Integrity (`integrity="sha384-..."`) hashes. | Medium | **Fixed 2026-11-27.** Font Awesome is gone entirely (see IMPLEMENTATION_STATUS.md, icon consolidation). Swiper's floating `@11` tag pinned to an exact version (11.2.10) so its hash is stable; Bootstrap/AOS/ionicons/animate.css were already pinned. `integrity` + `crossorigin="anonymous"` added to all 9 remaining CDN resources on all 10 pages (90 attributes), hashes computed with `curl -sL <url> \| openssl dgst -sha384 -binary \| openssl base64 -A`. Google Fonts' CSS link intentionally has no SRI — its response is content-negotiated per user-agent, so there's no single file to hash. Verified with Playwright: all resources load (hash matches), libraries initialize, zero console/failed-request errors. |
| 5 | The contact form's "Send Message" button does not actually send anything to a server — it opens a `wa.me` link with the message pre-filled, meaning the data never touches any Batmobilz-controlled storage, and nothing is logged or retained on the client beyond that session. No PII is persisted anywhere by this site (no `localStorage`/`cookie` writes found anywhere in the codebase). | None (by design — but see the honesty concern logged in PROJECT_AUDIT.md item 15) | Verified. |
| 6 | External links that open in a new tab (`target="_blank"`) — the Google Maps "VIEW MAP" footer link — correctly omit `rel="noopener"` only inconsistently: checked all `target="_blank"` usages across the 10 pages. | Low | See detail below. |
| 7 | The privacy policy promises data protection practices ("appropriate data collection, storage, and security measures") for a site that collects no data server-side today. This isn't a code vulnerability, but it's a policy/reality mismatch worth flagging: the privacy policy is written for a future stateful backend (user accounts, bookings) that doesn't exist yet. Not a bug to fix in code — a content-accuracy note for whoever owns the legal pages. | None (content note) | Flagged, not changed — legal text ownership. |

### Detail on #6 — `target="_blank"` / `rel="noopener"`

Grepped every `target="_blank"` across all 10 pages:

```
href="https://maps.google.com" ... target="_blank"
```

This appears once per page (footer "VIEW MAP" link) — **10 occurrences total, none carry `rel="noopener noreferrer"`**. Without it, the newly opened tab can, in older browsers, access `window.opener` and redirect the original tab (a reverse-tabnabbing risk). Low real-world severity since the destination is Google Maps, not attacker-controlled, but it's a one-line, zero-risk hardening fix.

**This was fixed in this pass** — `rel="noopener noreferrer"` added to the Google Maps link in every page's footer and in `contact.html`'s "VIEW MAP"-equivalent link.

## What was NOT tested

- No dependency vulnerability scan (e.g. `npm audit`) was run beyond the one local `package.json` (`sass`, a dev-only build tool with no runtime exposure) — there is no other `package.json`/lockfile for the CDN-loaded libraries since they aren't installed via npm in this project; their versions are pinned in each page's `<script src>` URL (Bootstrap 5.3.3, Swiper 11, AOS 2.3.1, Font Awesome via kit, animate.css 4.1.1). Checking each of those for known CVEs against their pinned versions would need an internet-connected vulnerability database lookup, which wasn't performed in this session.
- No browser-based testing (CSP header behavior, mixed-content warnings, actual console errors) — no browser tool available this session.
