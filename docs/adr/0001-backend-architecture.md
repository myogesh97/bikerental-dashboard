# ADR 0001: Backend architecture for the booking system

Status: Accepted (pre-decided by the project owner; this ADR documents the reasoning, trade-offs, and exit path, not a vote).
Date: 2026-11-27

## Context

The site is currently a static HTML/SCSS/vanilla-JS frontend with no backend. FUTURE_ROADMAP.md calls for online booking, authentication, an admin dashboard, and payments — all of which need a real backend: a database with concurrency-safe writes, server-side authorization, server-computed pricing, and a payment integration that can't be faked from the client.

## Options considered

### Option A — Supabase (Postgres + Auth + Storage + Edge Functions)

- **What it is**: managed Postgres with Row-Level Security as the authorization layer, built-in email/OTP auth, file storage, and Deno-based Edge Functions for server logic that can't live in RLS (e.g. calling Razorpay).
- **Pros**: the double-booking guard this project needs (`EXCLUDE USING gist`) is a native Postgres feature — no other option here gives that for free. RLS lets "a customer can only see their own bookings" be enforced at the data layer, not just in app code, which directly closes the IDOR/enumeration risk in the threat model below. Local dev story (CLI + migrations) matches the "every schema change is a migration" hard rule exactly. Free tier is viable at this project's scale.
- **Cons**: Edge Functions are Deno, a second runtime from the frontend's plain Node/browser JS — small learning-curve tax. Vendor-specific RLS policy syntax is not portable as-is to another Postgres host without rewriting policies (though the SQL *schema* itself is portable). Real-time/row-streaming features this project doesn't need add surface area we won't use.
- **Lock-in**: medium. The schema, migrations, and RLS policies are plain Postgres + SQL — a `pg_dump`/`pg_restore` to any Postgres host works. Auth (`auth.users`) and Storage are Supabase-specific; migrating off means standing up a replacement auth system and re-pointing file references, which is real work but not a rewrite of the data model.
- **Cost at 10–50 bikes**: this is a low-write, low-row-count workload (tens of bikes, hundreds of bookings/month at most). Comfortably fits Supabase's free tier through the 50-bike mark; the first paid tier (~$25/mo) only becomes relevant for traffic/storage well beyond this project's current scale.

### Option B — Node/Express + Postgres (self-hosted or managed, e.g. Render/Railway)

- **Pros**: maximum control, no vendor-specific auth/storage to later migrate off, ordinary Node everywhere (same runtime as the rest of the stack).
- **Cons**: every piece Supabase gives for free has to be built and secured by hand — auth (password or OTP flows, session/JWT handling, email delivery), authorization (would default to app-code checks instead of RLS, which the hard rules explicitly want to avoid: "RLS enabled on every table, default deny" assumes a Postgres-with-RLS target), file storage, and the local-dev/migration tooling. This is materially more code to write, test, and keep secure for a one-person team, for a project at this scale.
- **Lock-in**: lowest of the three — but the cost of that low lock-in is paid upfront in build time, not saved later.
- **Cost**: a small Postgres instance + a small app server, roughly comparable to or more than Supabase's paid tier once you count the server that has to run 24/7 regardless of traffic (Supabase's free tier pauses/scales differently).

### Option C — Firebase (Auth + Firestore) or MongoDB Atlas

- **Pros**: Firebase Auth is mature and well-documented; MongoDB's flexible schema is easy to prototype with.
- **Cons — disqualifying for this project specifically**: neither is a relational database with range-overlap exclusion constraints. The "double-booking must be impossible at the database level" hard rule needs `EXCLUDE USING gist` (or equivalent transactional serialization logic reimplemented by hand in application code, which reintroduces exactly the race condition the hard rule exists to prevent). Firestore/Mongo transactions can simulate this with optimistic locking, but it's bespoke code to get right versus a single `CREATE CONSTRAINT` in Postgres, and it would need its own dedicated test suite to prove it's actually race-free under concurrent writes — redoing the problem this project already decided (via Supabase/Postgres) is solved.

## Decision

**Supabase**, per the project owner's standing decision. This ADR's job is to confirm it holds up under the hard rules, not to relitigate it — and it does: the exclusion-constraint requirement alone makes Option C non-viable, and Option A gives the RLS-by-default and migration-based schema the hard rules already assume, at a fraction of the build cost of Option B for a project this size.

## Consequences

- Every schema change is a SQL migration under `supabase/migrations/`, reviewed like code.
- Local development requires Docker (for the Supabase CLI's local Postgres/Auth/Storage stack). **This machine does not have Docker installed** (`docker: command not found`, no Docker Desktop app, no colima/podman). This blocks running `supabase start`, `supabase db reset`, and the pgTAP suite in this environment until either Docker is installed here or migrations/tests are run against a real Supabase project instead of the local stack. Flagged for a decision in the Phase 0 report — this is the single biggest practical blocker to Phase 1 starting immediately.
- Authorization logic lives in RLS policies (SQL), not in the frontend JS. The frontend must never be trusted to enforce "customers can only see their own bookings" — that's a defense-in-depth statement, not the actual guarantee.
- Payment logic (Razorpay order creation, signature verification, webhook handling) lives in Edge Functions, since RLS can authorize *data access* but can't make an outbound HTTPS call to Razorpay or hold a `service_role`/webhook secret.

## Exit strategy

If Supabase ever needs to be left: the Postgres schema (tables, constraints, RLS policies, functions) exports via standard `pg_dump` to any Postgres 15+ host. The two Supabase-specific pieces to replace are (1) `auth.users` and the email-OTP flow — migrate to another auth provider or hand-rolled JWT issuance, re-pointing `profiles.id` at the new user IDs; and (2) Supabase Storage — re-upload `bike_images` to the new storage target and update `storage_path` values. Razorpay integration (Edge Functions) ports to any Node/Deno server with outbound HTTPS. No proprietary query language or non-standard SQL is used anywhere in the schema, by design.
