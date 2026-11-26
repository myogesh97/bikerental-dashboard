# SEO Audit — Batmobilz Rentals

## Findings and fixes

| Item | Before | After |
|---|---|---|
| `<title>` uniqueness | `index.html`, `aboutus.html`, `blogs.html` all shared the literal title `Bike Rental`; policy pages had short generic titles (`Pricing Policy`, `Privacy Policy`, etc.) | Every page now has a unique, descriptive title incorporating the business name, e.g. `Batmobilz Rentals - Motorcycle Rentals in Guwahati, Northeast India`, `A Rider's Guide to Tawang - Batmobilz Rentals Blog`. |
| Meta description | None existed on any of the 10 pages. | Added a unique, accurate (not keyword-stuffed, not fabricated) `<meta name="description">` to every page, written from content already on that page. |
| `robots.txt` | Did not exist. | Added — allows all crawling, references a sitemap. |
| `sitemap.xml` | Did not exist. | Added, listing all 10 static pages. |
| Canonical URLs | None. | **Not added** — a canonical tag needs the real production domain, which doesn't exist yet. Adding `rel="canonical"` pointing at a placeholder would be actively wrong (telling search engines the canonical page lives at a domain that resolves to nothing). Left out; see PRODUCTION_READINESS.md. |
| Open Graph / social sharing tags | None. | **Not added in this pass** — OG tags (`og:image` especially) should point at real, locally-hosted images; since the current hero/banner images are hot-linked from a third-party demo site (see PERFORMANCE_AUDIT.md / PROJECT_AUDIT.md), adding `og:image` now would point social previews at someone else's CDN. Flagged as a follow-up once real imagery is in place. |
| Structured data (Schema.org) | None. | **Not added.** `LocalBusiness` structured data needs a real, verified business address and phone number — the current address ("Street Address, Area, City - 000000") and phone (`+91 00000 00000`) are placeholders throughout the site. Publishing structured data with fabricated contact details would be actively harmful (search engines may surface the fake address/phone to real users). This is the single most important blocker to close before any SEO structured-data work — see PROJECT_AUDIT.md and PRODUCTION_READINESS.md. |
| Heading structure | Each page already has exactly one `<h1>` with a sensible page topic, and `<h2>`/`<h3>` are used descending in order — confirmed by reading all 10 pages. | No change needed. |
| Image alt text | Spot-checked across all pages; content images have descriptive alt text (e.g. `"Motorcycles parked with a scenic mountain view in the Northeast"`); a few decorative/duplicate slider images use generic `alt="bike image"` — acceptable for a non-informational repeating slider, not a real SEO or accessibility defect. | No change needed. |
| Internal linking | All nav/footer links verified against the filesystem — zero broken internal links. | No change needed. |
| URL structure | Flat, descriptive filenames (`bike-shop.html`, `contact.html`, etc.) — fine for a site this size. `bike.html?slug=...` for bike detail pages is not ideal for SEO (query strings aren't as clean as path segments, and all bike detail variants currently share one canonical-looking URL base), but a proper fix (`/bikes/classic-350-2023.html` or server-side routing) requires either a build step or server config this static-hosting setup doesn't have. Documented in FUTURE_ROADMAP.md. | — |

## What's still blocking real SEO value

1. **Real business domain** — `robots.txt`'s `Sitemap:` line and `sitemap.xml`'s every `<loc>` currently say `REPLACE-WITH-PRODUCTION-DOMAIN`. These must be swapped for the real domain before deployment, or they're worse than useless (a sitemap that 404s looks bad to crawlers).
2. **Real business address and phone number** — blocks `LocalBusiness` structured data, blocks Google Business Profile setup, blocks a trustworthy embedded map (the current map iframe queries `q=India`, the entire country, because there's no real address to query).
3. **Real photography** — blocks safely adding `og:image`/Twitter Card tags.

None of these were invented in this pass, per the explicit instruction not to fabricate business information — they're listed here as exactly what's needed, from whom, before the next SEO increment can land.
