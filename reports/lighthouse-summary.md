# Lighthouse results

Run 2026-11-27, Lighthouse 13.6.0 against all 10 pages served locally (`python3 -m http.server`) with Playwright's Chrome for Testing, default simulated throttling (no custom flags). Localhost + simulated throttling numbers are not representative of production hosting — treat scores/LCP as directional, not a promise of real-world performance. Full raw JSON per page was generated locally in this same run but is not committed (600KB-1MB each, mostly trace/screenshot data) — regenerate with the command below if needed.

| Page | Performance | Accessibility | Best Practices | SEO | FCP | LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|---|
| index.html | 94 | 100 | 100 | 100 | 2.5s | 2.5s | 0.004 | 10ms |
| aboutus.html | 76 | 96 | 100 | 100 | 2.2s | 5.9s | 0.004 | 0ms |
| bike.html | 74 | 96 | 100 | 100 | 2.4s | 6.8s | 0.015 | 0ms |
| bike-shop.html | 71 | 97 | 100 | 100 | 2.5s | 9.2s | 0.004 | 120ms |
| blogs.html | 76 | 96 | 100 | 100 | 2.2s | 5.9s | 0.029 | 60ms |
| contact.html | 86 | 97 | 100 | 100 | 2.1s | 3.9s | 0.007 | 0ms |
| delivery-policy.html | 96 | 96 | 100 | 100 | 2.1s | 2.1s | 0.004 | 120ms |
| pricing-policy.html | 95 | 96 | 100 | 100 | 2.4s | 2.4s | 0.004 | 0ms |
| privacy-policy.html | 95 | 96 | 100 | 100 | 2.3s | 2.3s | 0.004 | 0ms |
| terms-condition.html | 96 | 96 | 100 | 100 | 2.2s | 2.2s | 0.004 | 110ms |

Reproduce:
```bash
python3 -m http.server 8099
CHROME_PATH=/path/to/chrome npx lighthouse http://localhost:8099/<page>.html \
  --output=json --output-path=reports/lighthouse/<page>.json \
  --chrome-flags="--headless=new --no-sandbox" \
  --only-categories=performance,accessibility,best-practices,seo
```

## Accessibility: 96-100 across the board

The sub-100 pages (everything except index.html) are held back by axe-detected color-contrast violations — see `reports/axe-*.json` and ACCESSIBILITY_AUDIT.md. index.html hit 100 only after this session's fixes (landmark restoration, decorative-icon labeling).

## Performance: LCP is the dominant factor, and it's bimodal

Two clusters:
- **Legal pages (95-96) and index.html (94)**: LCP is CSS/text-based or already fixed with `fetchpriority="high"`, nothing left on the table without a hosting/CDN change.
- **aboutus/bike/bike-shop/blogs (71-76)**: LCP is 5.9-9.2s even after fetchpriority/preload fixes this session. Lighthouse's own `lcp-breakdown-insight` audit shows the actual resource-loading subparts (TTFB, load delay, load duration, render delay) summing to under 1 second on bike-shop.html, which doesn't match the 9.2s headline LCP — this is a known Lighthouse quirk where the simulated-throttling trace used for the headline metric diverges from the simplified insight-audit model, and it's exaggerated further by every page loading Bootstrap + Swiper + AOS + animate.css + Font Awesome + ionicons synchronously regardless of whether that page uses them (already flagged in PERFORMANCE_AUDIT.md). This points at the same icon-consolidation/bundle-splitting work already documented there (Phase 2 backlog item 5) as the real fix, not a per-image tweak.

## What was fixed this session (see IMPLEMENTATION_STATUS.md for full detail)

- index.html's first hero-slide image and bike.html's product image were `loading="lazy"` despite being the page's primary above-the-fold content — removed, replaced with `fetchpriority="high"`.
- bike-shop.html's first inventory-card image (the actual measured LCP element) got `fetchpriority="high"`.
- aboutus.html, contact.html, blogs.html have their LCP element as a CSS `background-image` (undiscoverable to the browser's preload scanner) — added `<link rel="preload" as="image" fetchpriority="high">` for each.

## Not fixed, and why

- The bimodal LCP gap above needs the icon-library/bundle-splitting decision from PRODUCTION_READINESS.md / PERFORMANCE_AUDIT.md, not a quick patch.
- Real image compression/WebP/`srcset` work stays blocked on real photography per PROJECT_AUDIT.md — the current hot-linked `demo2.wpopal.com` images can't be optimized without replacing them first.
