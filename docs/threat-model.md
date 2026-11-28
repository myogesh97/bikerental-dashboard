# Threat model (STRIDE)

Status: proposed, awaiting approval. Scope: the booking system described in `docs/data-model.md` — Supabase (Postgres/Auth/Storage/Edge Functions) + Razorpay, fronted by the existing static pages. Out of scope: physical security of the business, employee trust (an admin account is assumed honest once authenticated — see Elevation of Privilege below for what happens if that assumption breaks), and anything already covered by SECURITY_AUDIT.md for the static-site-only surface (XSS via `innerHTML`, SRI, CSP — those findings stand and aren't repeated here except where the new backend changes them).

## Spoofing (impersonating a user or system)

| Risk | Mitigation |
|---|---|
| Attacker signs in as another customer | Supabase email OTP/magic-link: possession of the email inbox is the credential. No passwords to phish or stuff. Session is a Supabase-issued JWT, not a client-chosen ID. |
| Attacker forges a Razorpay webhook call to fake a payment confirmation | `razorpay-webhook` Edge Function verifies `X-Razorpay-Signature` against the webhook secret (held only in Edge Function secrets, never in the repo or client) over the **raw** request body before trusting anything in it. A request without a valid signature is rejected before touching the database. |
| Attacker claims to be an admin by setting a role in a request body or local state | `role` lives only in `profiles.role`, set only via migration/service_role (see data-model.md). Every admin-gated RLS policy and Edge Function checks `auth.uid()` against `profiles.role = 'admin'` server-side; the client's "is this user an admin" state is UI convenience only and is never trusted. |
| Attacker replays a captured Razorpay signature/payload for a different booking | Signature verification is scoped to the specific `order_id`/`payment_id` pair; `verify-payment` additionally checks the order belongs to the booking being confirmed and the calling user owns that booking. |

## Tampering (modifying data/requests in transit or at rest)

| Risk | Mitigation |
|---|---|
| Client sends a booking request with a manipulated price | The client **never sends a price** (hard rule). `create_booking_hold` computes `amount_due_paise`/`advance_amount_paise` server-side from `bikes.price_paise` × nights × `business_config.advance_percent`. Tested explicitly in Phase 3's acceptance criteria ("client-side tampering with price/amount has zero effect"). |
| Client edits its own `profiles.role` via a crafted PATCH request | Blocked by the `BEFORE UPDATE` trigger on `profiles` (data-model.md) that rejects any session-initiated `role` change regardless of RLS policy wording — defense in depth in case a policy is ever written too loosely. |
| Admin dashboard write bypasses RLS via a bug in a client-side guard | The client-side admin gate is explicitly documented as UX-only; every admin write is additionally enforced by RLS requiring `profiles.role = 'admin'` for that `auth.uid()`, checked by Postgres itself, not by whether the admin UI happened to render. |
| Double-booking by two near-simultaneous requests | The `EXCLUDE USING gist` constraint (data-model.md) makes this a database-level impossibility, not an application-code race that can be bypassed by skipping a check. |

## Repudiation (denying having done something)

| Risk | Mitigation |
|---|---|
| Admin denies cancelling a booking or changing a price, customer denies requesting a cancellation | `audit_log` records every admin write (who, what, before/after, when) via a trigger — not optional application code, so it can't be forgotten on a new code path. Customer-initiated state changes (booking, cancellation) are timestamped on the `bookings` row itself and tied to `customer_id`. |
| Payment dispute ("I never got a refund") | `refunds` rows carry `razorpay_refund_id`, so every refund this system claims to have issued is checkable against Razorpay's own record, not just this database's say-so. |

## Information disclosure (seeing data you shouldn't)

| Risk | Mitigation |
|---|---|
| Customer A reads customer B's booking by guessing/incrementing an ID in the URL | `bookings.id` (uuid) is not sequential and not guessable; additionally, `GET` access is gated by RLS (`customer_id = auth.uid()` or `profiles.role = 'admin'`), so even a correctly-guessed UUID returns nothing for another user's row. Tested explicitly in Phase 3 ("enumeration") and Phase 6 ("users can never see another user's booking by changing the URL/ID"). |
| Customer reads another customer's profile (name, phone, DOB) | RLS on `profiles`: a row is readable only by its own `id = auth.uid()` or by an admin. Public bike-listing queries never join to `profiles`. |
| ID document numbers leak via a database dump, backup, or breach | Structurally impossible to leak what's never stored — `id_type` is an enum, no document number/image/OCR text is ever written to any table or Storage bucket (hard rule). |
| Admin dashboard exposes all customers' PII to any authenticated user via a missing RLS policy on an admin-only table | Default-deny RLS on every table (hard rule) means a *missing* policy fails closed (no access), not open — the dangerous failure mode (forgetting to add a policy) is the safe one here, not the unsafe one. Every policy is covered by a pgTAP test per the hard rules, specifically to catch the case where a policy is too permissive, not just absent. |
| Payment payloads logged with card/UPI details | Hard rule: never store card/UPI details (Razorpay Checkout.js handles those directly with Razorpay, this system never sees them); Edge Function logs are reviewed to ensure no full payment payload (which could contain customer PII beyond what's needed) is logged, only IDs/amounts/status. |
| Email OTP sent to the wrong address due to a typo reveals whether that email has an account (enumeration via auth) | Standard Supabase Auth behavior for magic-link flows already returns a generic "check your email" response regardless of whether the account exists, which avoids account-enumeration via the sign-in form itself. |

## Denial of service (making the system unusable)

| Risk | Mitigation |
|---|---|
| Attacker spams `create_booking_hold` to hold every bike permanently and starve real customers | Holds expire automatically (`hold_expires_at`, default 15 min, via `pg_cron`) regardless of whether payment is ever attempted — a hostile actor can at most deny a given bike for the hold window, not indefinitely, and rate limiting (Phase 7) on this endpoint caps how many holds one identity/IP can create per minute. |
| Brute-force OTP guessing | Rate limiting on the auth endpoint (Phase 7); Supabase Auth has its own built-in rate limits on OTP attempts as a second layer. |
| Webhook endpoint flooded with fake Razorpay events | Signature verification happens before any database write, so invalid requests are cheap to reject; genuine concern is Razorpay's own retry behavior on a slow endpoint, addressed by keeping `razorpay-webhook` fast and idempotent (returns 200 quickly, does minimal work per event). |

## Elevation of privilege

| Risk | Mitigation |
|---|---|
| A customer account is somehow granted `role = 'admin'` | Only reachable via a migration run with `service_role`/superuser credentials — never via any API path a customer session can reach, and the `profiles` trigger rejects client-initiated role changes even if an RLS policy bug were to otherwise allow the write. |
| A compromised admin account | Out of scope to fully prevent (any system trusts its own admins to some extent), but `audit_log` means a compromise is *detectable and attributable* after the fact — every write that account made is recorded with before/after state, not just "an admin did something." Recommend (Phase 7) that admin accounts also get Supabase's optional MFA enabled once real admin users exist — flagged as a follow-up, not committed to a phase number yet since it needs a real admin user to configure against. |
| Edge Function service-role key leaks (env misconfiguration, logging, etc.) | Never committed to the repo (hard rule — `.env.example` has names only); stored only in Supabase Edge Function secrets. Reviewed per-function that no code path logs `process.env`/`Deno.env` wholesale. |
| RLS policy accidentally grants `anon` write access to a sensitive table | Default-deny means a new table starts with zero policies = zero access for everyone including `anon`/`authenticated`; every grant is an explicit, reviewed, pgTAP-tested policy addition, never a blanket "enable RLS and allow all" shortcut. |

## Explicitly not covered here (tracked elsewhere or deferred)

- Static-site XSS/CSP/SRI findings — SECURITY_AUDIT.md, already addressed for the current frontend; will be revisited in Phase 7 once Supabase/Razorpay domains need adding to the CSP.
- Physical-world fraud (fake ID at pickup, stolen bike never returned) — business-process risk, not a software threat; `id_verified_at`/`id_verified_by` creates an audit trail for it but can't prevent it.
- DPDP Act compliance specifics (consent, grievance officer, retention) — `docs/privacy-data-inventory.md` and Phase 7.
