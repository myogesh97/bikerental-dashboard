# Future Roadmap — Features Deliberately Not Built

Per the engagement scope, these are documented for planning purposes only — nothing here was implemented, and no fake/mocked version of any of it was built.

## Online booking

- **Business value**: removes the current "message us on WhatsApp and negotiate manually" friction; lets customers see real-time availability and reserve a specific bike for specific dates without a human in the loop.
- **UX**: a date-range picker on `bike.html`, availability calendar per bike, a checkout flow collecting renter details and (per the existing Terms) ID verification, ending in a confirmed booking reference.
- **Backend needed**: a real database (bikes, bookings, customers, availability windows), a booking API, conflict/double-booking prevention logic, and ideally a payment gateway for the advance-payment step the Terms already describe.
- **Database**: at minimum `bikes`, `bookings`, `customers`, `payments` tables/collections with a `bookings`-to-`bikes` availability join.
- **API**: authenticated endpoints for creating/reading/cancelling bookings; public read-only endpoint for availability.
- **Security considerations**: this is where real auth, PII handling, and payment-data handling (PCI scope if cards are touched directly, or hand off to a provider like Razorpay/Stripe to avoid that scope) become necessary — the current site has none of this because it's never needed it.
- **Complexity**: High. This is the single biggest jump in the whole roadmap — it turns a static site into a real application with state.
- **Priority**: High (it's the thing that would most change the business), but should come after the current site's existing placeholder business data (phone, address, deposit terms) is finalized, since booking flows will surface those same numbers to real customers.

## Admin dashboard for inventory management

- **Business value**: lets staff update bike availability/pricing without a developer editing `bikes-data.js` and redeploying.
- **UX**: a login-gated internal page listing bikes, with edit forms for price/availability/specs, and (once booking exists) a view of upcoming reservations per bike.
- **Backend needed**: depends entirely on booking/inventory existing as real backend state first — an admin dashboard without a backend is just editing static files, which is what `assets/js/bikes-data.js` already lets a developer do today.
- **Security considerations**: proper authentication (not a shared password in client-side JS), role separation if more than one staff type exists.
- **Complexity**: Medium, once a backend exists; otherwise not meaningfully buildable.
- **Priority**: Medium — valuable, but only once there's enough inventory churn to justify it over editing `bikes-data.js` directly (which, for 10–20 bikes, is genuinely fine for now).

## User login and booking history

- **Business value**: returning-customer convenience (saved details, repeat-booking, loyalty).
- **UX**: account creation/login, a "my bookings" page.
- **Backend needed**: user accounts table, session/auth management (hashed passwords or a third-party auth provider), tied to the booking system above.
- **Security considerations**: this is a genuine PII-handling surface — password storage, session security, and the data-retention promises already made (prematurely) in `privacy-policy.html` would need to actually be implemented, not just stated.
- **Complexity**: Medium-High, and depends on booking existing first.
- **Priority**: Low until booking exists — a login system with nothing to log into isn't useful on its own.

## Backend integration generally (Node.js / Firebase / MongoDB, per the README)

- All three of the above features are really one underlying need: a persistent backend. The current site has deliberately stayed frontend-only per this engagement's scope. When the business is ready to commit to a backend, the recommendation is to scope booking first (highest value), let inventory-admin and login follow naturally from the same backend, rather than building a backend for inventory-editing alone.

## Smaller, lower-risk items also deferred (not "future product," just not done in this pass)

- Real pagination on `bike-shop.html` once inventory exceeds one comfortable page of cards (see PROJECT_AUDIT.md — currently the pagination markup is dead and inventory is small enough not to need it yet).
- Splitting shared CSS/JS so legal/content pages don't load slider/animation libraries they don't use (see PERFORMANCE_AUDIT.md).
- Subresource Integrity hashes on CDN scripts (see SECURITY_AUDIT.md).
