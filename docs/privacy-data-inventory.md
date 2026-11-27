# Privacy data inventory

Status: proposed, awaiting approval. This is the factual inventory that `privacy-policy.html` must be rewritten to match (Phase 7) — the policy should describe exactly this, no more and no less. Legal basis terminology follows India's Digital Personal Data Protection Act 2023 (DPDP Act) and the DPDP Rules 2025, which is primarily **consent**-based (the Act's limited list of "certain legitimate uses" — employment, medical emergency, state functions, etc. — doesn't cover a commercial bike-rental booking, so consent is the operative basis for essentially everything here, not an alternative to it).

**Every retention period marked "to confirm" is a placeholder, not a decision** — Indian financial record-keeping requirements (Income Tax Act, Companies Act) typically run 6-8 years depending on record type, but the exact figure needs a CA/lawyer, not an engineering guess. Nothing in this document should be copied into a public-facing policy as a final number until that confirmation happens.

| Field | Where stored | Purpose | Lawful basis | Retention | Who can access |
|---|---|---|---|---|---|
| Email address | `auth.users` (Supabase Auth) | Sign-in (OTP/magic-link), booking confirmation emails | Consent (account creation) | Until account deletion requested, then erased | The user themself; Supabase (processor); no admin UI exposes raw auth table — admins see it only via `profiles`/booking views where relevant to a support task |
| Full name | `profiles.full_name` | Identify the renter on bookings, display in admin dashboard | Consent | Until account deletion, except on `bookings` rows tied to financial records (see "Booking + payment records" below) | User (own); admin |
| Phone number | `profiles.phone` | Contact about a booking (not marketing) | Consent | Until account deletion | User (own); admin |
| Date of birth (self-declared) | `profiles.dob` | Self-declared 21+ eligibility check before allowing a booking | Consent | Until account deletion | User (own); admin |
| Role (`customer`/`admin`) | `profiles.role` | Authorization | Not personal data in the DPDP sense (an access-control attribute), but listed for completeness | Lifetime of the account | System (RLS); admin (read-only for other users, via audit-logged action) |
| Booking dates, bike selected, status | `bookings` | Operate the rental business | Consent (at time of booking) + contractual necessity for the duration of an active booking | See "Booking + payment records" below | User (own bookings only); admin |
| `id_type` (enum: Aadhaar/Voter ID/Passport/driving licence — **type only**) | `bookings.id_type` | Record which document category was checked at pickup | Consent + legal requirement to verify identity before vehicle handover | Same as the booking record (below) | Admin who verified it; other admins via audit log |
| **The ID document itself (number, image, OCR text)** | **Nowhere — never collected, per hard rule** | N/A | N/A | N/A | N/A |
| `id_verified_at`, `id_verified_by` | `bookings` | Audit trail that an admin physically checked an ID | Legitimate business record-keeping (not about the user's data, about the admin's action) | Same as the booking record | Admin; audit log |
| Deposit collected (amount, timestamp) | `bookings.deposit_collected_at/amount` | Record that a security deposit changed hands offline at pickup | Contractual necessity, financial record | Same as financial retention (below) | Admin; audit log |
| Payment amount, Razorpay order/payment IDs, status | `payments` | Process and reconcile the advance payment | Consent (at time of payment) + contractual necessity | Financial record retention (to confirm — see above) | User (own, via booking detail); admin |
| **Card/UPI/bank details** | **Nowhere — Razorpay Checkout.js handles these directly with Razorpay, this system never receives or stores them** | N/A | N/A | N/A | N/A |
| Refund amount, Razorpay refund ID, reason | `refunds` | Process and reconcile refunds | Consent (implicit in requesting a cancellation) + contractual necessity | Same as financial retention | User (own); admin |
| Cancellation reason (free text, if collected) | `bookings.cancellation_reason` | Understand why bookings are cancelled | Consent | Same as the booking record | Admin; audit log |
| Admin's own actions (what they changed, when) | `audit_log` | Accountability, dispute resolution, security investigation | Legitimate interest in operating the business securely — this is a record of staff conduct, not customer data, though it may reference customer records | Longer of (a) the referenced record's retention, (b) a security-investigation window (to confirm, no shorter than financial retention) | Admin only (ideally a separate "owner"/superadmin role once more than one admin exists — not modeled in v1, flagged for Phase 5/7) |

## Booking + payment records — the retention question

A completed booking's rows (`bookings`, `payments`, `refunds`) contain both operational data (what bike, what dates) and financial data (what was paid, what was refunded). Indian tax law requires financial records to be kept for a minimum period regardless of whether the customer later asks to delete their account — this is the "retain only what accounting requires" carve-out the DECISIONS table already anticipates. Until a CA/lawyer confirms the exact period:

- **Placeholder assumption** (not final): 8 years from the financial year of the transaction, matching the longer end of common Indian retention guidance for Income Tax Act purposes. Stored as a value in `business_config` (added in Phase 7), not hard-coded, so it can be corrected without a schema change.
- On an account-deletion request (Phase 6/7): `profiles` PII (name, phone, DOB, email via `auth.users`) is deleted/anonymized immediately; `bookings`/`payments`/`refunds` rows are **not** deleted but have their `customer_id` repointed to a shared "deleted user" placeholder profile (or equivalent anonymization), preserving the financial record's integrity for reconciliation/audit while removing the link back to the individual, consistent with DPDP's expectation that data no longer serving its original purpose is erased *except* where another law requires retention.

## DPDP Act rights this system must support (Phase 6/7)

- **Right to access**: "my bookings" + profile view already planned (Phase 6) satisfies this for booking/profile data.
- **Right to correction**: profile edit (Phase 6).
- **Right to erasure**: account deletion request flow (Phase 6/7), subject to the financial-retention carve-out above.
- **Right to grievance redressal**: requires a named grievance officer and contact method published in the privacy policy — **this is a BLOCKED-ON-CLIENT item**, cannot be invented. The policy ships with a clearly marked placeholder and the preflight check (Phase 8) fails if it's still a placeholder at launch time.
- **Right to nominate** (DPDP's provision for someone to exercise these rights on the user's behalf in case of death/incapacity): not modeled in v1 — flagged as a gap to accept or address in Phase 7, since the Act lists it as a Data Principal right but FUTURE_ROADMAP.md's scope doesn't mention it.
- **Consent**: must be specific and unbundled — the signup/booking consent (Phase 7) is separate from any future marketing consent (marketing isn't in scope at all right now, so there is no marketing checkbox to accidentally bundle it with — worth stating explicitly so a future feature doesn't quietly bundle them).

## What is explicitly NOT collected (by hard rule, worth stating affirmatively in the policy)

- No ID document number, image, or OCR text.
- No card/UPI/bank account details.
- No location tracking.
- No marketing consent/communication in v1 (nothing to opt into).
- No data shared with third parties beyond the processors necessarily involved in delivering the service itself (Supabase as infrastructure/data processor, Razorpay as payment processor, the email provider for transactional mail) — no data sale, no ad-tech, no analytics beyond what's already disclosed.
