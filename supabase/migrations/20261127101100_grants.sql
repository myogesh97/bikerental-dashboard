-- Table-level privilege GRANTs. Postgres privileges and RLS policies
-- are two separate layers: RLS restricts WHICH ROWS a query can touch,
-- but a role needs the base GRANT before it's allowed to attempt the
-- operation at all (found this the hard way - verified by querying
-- the live REST API as anon immediately after the first migration run
-- and getting "permission denied for table X", not an RLS-filtered
-- empty result, confirming no grants existed yet).
--
-- Each grant here is deliberately no broader than what the matching
-- RLS policy (in that table's own migration file) actually allows -
-- e.g. bookings gets no INSERT grant for `authenticated` here because
-- Phase 3's create_booking_hold() is SECURITY DEFINER and does not
-- need the caller to have direct INSERT privilege on the table.

grant usage on schema public to anon, authenticated;

-- bikes: public read, admin write (admin-ness enforced by RLS)
grant select on public.bikes to anon, authenticated;
grant insert, update on public.bikes to authenticated;

-- bike_images: public read, admin write
grant select on public.bike_images to anon, authenticated;
grant insert, update, delete on public.bike_images to authenticated;

-- bike_blocks: admin-only (no anon grant at all)
grant select, insert, update, delete on public.bike_blocks to authenticated;

-- profiles: a user reads/updates their own row or (if admin) others';
-- INSERT is handled only by the SECURITY DEFINER handle_new_user
-- trigger, so no INSERT grant to authenticated/anon.
grant select, update on public.profiles to authenticated;

-- bookings: read own (or all, if admin); writes happen only through
-- SECURITY DEFINER functions added in Phase 3/5/6, so no INSERT grant
-- yet. UPDATE grant exists for the admin-only state-transition policy.
grant select, update on public.bookings to authenticated;

-- payments / refunds: read-only from the client; all writes come from
-- Edge Functions using the service_role key, which already bypasses
-- RLS and grants by design.
grant select on public.payments to authenticated;
grant select on public.refunds to authenticated;

-- business_config: any authenticated user can read (booking UI needs
-- hold_minutes/cancellation rules); only admins can write (RLS-gated).
grant select, update on public.business_config to authenticated;

-- audit_log: admin-only read (RLS-gated); all writes come from the
-- SECURITY DEFINER write_audit_log trigger, so no INSERT grant.
grant select on public.audit_log to authenticated;
