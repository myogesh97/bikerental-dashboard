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

## Content Security Policy (2026-11-27)

Drafted and **empirically tested** against all 10 pages (not deployed — ship this as a host header, not a meta tag, so `frame-ancestors`/reporting work and it can be edited without touching markup).

### Why this is testable now and wasn't before

A strict CSP needs zero inline `<script>`/`<style>` and zero `onclick=`-style handlers to work without `'unsafe-inline'`. Checked all three across all 10 pages:
- **Inline event handlers / `javascript:` URLs**: zero found (and zero in this codebase previously).
- **Inline `<style>` blocks / `style="..."` attributes**: zero — removed in the Phase 1 inline-CSS-extraction pass (see IMPLEMENTATION_STATUS.md).
- **Inline `<script>` blocks**: two remained (`bike.html`'s per-bike renderer, `contact.html`'s form handler) — extracted to `assets/js/bike-detail.js` and `assets/js/contact-form.js` this session (IMPLEMENTATION_STATUS.md).

With all three clear, a real browser test became possible: used Playwright to inject a draft CSP as a response header (not a meta tag, so it behaves exactly like a real deployment) on all 10 pages, interacted with each page (scrolled, opened the mobile nav), and collected actual `Content-Security-Policy` violation console messages — rather than guessing which third-party scripts need what.

### What that test found (three real, non-obvious blockers)

An initial draft policy produced violations on every page. All three traced to **third-party library internals**, not this codebase's own markup:

1. **`style-src` needs ionicons' own injected stylesheet.** ionicons injects a tiny static `<style>` tag at runtime for FOUC prevention (`ion-icon{visibility:hidden}.hydrated{visibility:inherit}`) — confirmed by reading it back from the live DOM and hashing it. Allowed with a specific hash (`'sha256-NBfyYgxoWTkJ9SyHWLNVIq8UkKGvsaGPAaGmNMpVMSA='`) instead of `'unsafe-inline'`, so nothing else can inject arbitrary styles.
2. **`font-src` needs `data:`.** Swiper's bundled CSS embeds its own navigation-arrow icon font as a base64 `data:` URI directly in a `@font-face` rule (confirmed by grepping the fetched `swiper-bundle.min.css`) — not something this project's code controls.
3. **`connect-src` needs `https://unpkg.com`.** ionicons doesn't inline every icon's SVG; it `fetch()`es each one individually at runtime from the same host its script loads from. Without this, every single icon on the page silently fails to render under a strict CSP.

None of these would have been found by reading the code alone — all three are internal behavior of third-party libraries, only visible by actually running them under an enforced policy.

### The policy (verified zero violations on all 10 pages)

```
Content-Security-Policy: default-src 'none'; script-src 'self' https://cdn.jsdelivr.net https://unpkg.com; style-src 'self' 'sha256-NBfyYgxoWTkJ9SyHWLNVIq8UkKGvsaGPAaGmNMpVMSA=' https://fonts.googleapis.com https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' https://demo2.wpopal.com https://images.unsplash.com data:; frame-src https://maps.google.com https://www.google.com; connect-src 'self' https://unpkg.com; base-uri 'none'; form-action 'self';
```

Recommended deployment (Netlify `_headers`, not committed/active — see `_headers.example` in the repo root):

```
/*
  Content-Security-Policy: default-src 'none'; script-src 'self' https://cdn.jsdelivr.net https://unpkg.com; style-src 'self' 'sha256-NBfyYgxoWTkJ9SyHWLNVIq8UkKGvsaGPAaGmNMpVMSA=' https://fonts.googleapis.com https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' https://demo2.wpopal.com https://images.unsplash.com data:; frame-src https://maps.google.com https://www.google.com; connect-src 'self' https://unpkg.com; base-uri 'none'; form-action 'self'
```

`img-src` still allows `demo2.wpopal.com` (hot-linked hero/team photos) and `images.unsplash.com` (one blog post header background) — both go away once PRODUCTION_READINESS.md's real-photography item is resolved and images are self-hosted, at which point `img-src 'self'` alone would work. `frame-src` allows Google Maps for the embedded office map. `form-action 'self'` is safe since the contact form never actually submits anywhere (it opens WhatsApp via JS, not a form POST).

### What would still block this at actual deploy time

- This was verified by injecting the header via Playwright's request interception, which behaves identically to a real server header for the browser's CSP engine — but it was never tested against a real Netlify/Vercel deploy, real network latency, or a real user's browser extensions (ad blockers etc. can themselves trigger CSP-adjacent console noise that looks like a violation but isn't).
- Report-only mode (`Content-Security-Policy-Report-Only` plus a `report-uri`/`report-to`) wasn't set up — recommended as the actual rollout step before enforcing, in case a browser/extension combination this session didn't test trips a new violation in production.
- No dependency vulnerability scan (e.g. `npm audit`) was run beyond the one local `package.json` (`sass`, a dev-only build tool with no runtime exposure) — there is no other `package.json`/lockfile for the CDN-loaded libraries since they aren't installed via npm in this project; their exact versions are now pinned and SRI-hashed (see finding #4). Checking each against known CVEs would need an internet-connected vulnerability database lookup, not performed in this session.
