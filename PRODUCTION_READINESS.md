# Production Readiness — Batmobilz Rentals

## Build & local development

No build step is required to run the site — it's static HTML/CSS/JS. The only build tool is Sass, used solely to compile `assets/css/main.scss` → `assets/css/main.css`.

```bash
# One-time setup
cd assets/css
npm install            # installs sass locally (pinned via package-lock.json)

# After any .scss edit, recompile:
npx sass main.scss main.css

# Or watch continuously while developing:
npx sass --watch main.scss:main.css
```

To view the site locally, serve the repo root with any static file server (opening `index.html` directly via `file://` mostly works too, since nothing here depends on a backend, but a server avoids any path-resolution surprises):

```bash
# from the repo root
python3 -m http.server 8080
# then open http://localhost:8080/index.html
```

## Deployment

This is a pure static site — compatible as-is with Netlify, Vercel (static), GitHub Pages, or any plain static host. No server, no environment variables, no database.

Suggested minimal deploy steps (Netlify/Vercel style):
1. `cd assets/css && npm ci && npx sass main.scss main.css` (ensure compiled CSS is committed or built in CI)
2. Deploy the repo root as the publish directory — no further build command needed.

## Known limitations / blockers before a real launch

These are things this pass could not resolve because they require information or assets only the business can provide — nothing here was invented to paper over the gap:

1. **Placeholder business contact details everywhere**: phone `+91 00000 00000`, email `info@example.com`, address `Street Address, Area, City - 000000`. These appear in every page's header/footer, the contact page, and the WhatsApp deep links (`https://wa.me/910000000000`) — meaning **the WhatsApp "Contact us" buttons currently point at a fake phone number and will not reach anyone.** This is the single highest-priority item before launch.
2. **Legal placeholder values in `terms-condition.html`**: the security deposit range (`[e.g., ₹5,000 to ₹15,000, depending on the bike]`) and refund timeline (`[e.g., 7 working days]`) are bracketed template placeholders, not real policy. Needs sign-off from whoever owns pricing/legal policy at the business.
3. **Hot-linked third-party imagery** (`demo2.wpopal.com/lexrider/...`) across the homepage and about page — hero banners, team photos, info-banner images. These need to be replaced with real, licensed, locally-hosted photography. Until then, production is dependent on an unrelated third party's server staying up.
4. **Domain name**: `robots.txt` and `sitemap.xml` both currently contain a `REPLACE-WITH-PRODUCTION-DOMAIN` placeholder that must be swapped for the real domain before deploying, or removed/left non-functional otherwise.
5. **Google Maps embed** queries `q=India` (the whole country) because there's no real address yet — cosmetic until item 1's address is real.
6. **No SRI hashes** on CDN-loaded scripts (Bootstrap, Swiper, AOS, Font Awesome, animate.css, ionicons, Google Fonts) — see SECURITY_AUDIT.md. Not launch-blocking, but recommended before scaling traffic.
7. **Bikes-in-fleet count (18) vs. bikes actually listed in the shop (10)** — needs a business answer: either list the other 8 bikes, or adjust the stats claim. Left alone rather than guessed.

## Release checklist (what "ready" looks like)

- [ ] Real phone number, email, and address in place of every placeholder (search for `00000` and `example.com` to find them all)
- [ ] Real photography replacing every `demo2.wpopal.com` URL
- [ ] Real security deposit and refund-SLA values in `terms-condition.html`
- [ ] Production domain substituted into `robots.txt` and `sitemap.xml`
- [ ] A decision on the 18-vs-10 fleet count
- [ ] A Lighthouse + axe-core pass against the deployed site (not done in this session — no browser tool available)
- [ ] A real cross-browser/responsive manual pass (not done in this session)
- [ ] A decision on the contact form: keep the "opens WhatsApp" behavior but disclose it up front, or wire up a real form backend (Netlify Forms, Formspree, etc.) if actual email delivery is wanted
