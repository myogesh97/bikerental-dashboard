-- Extensions needed by the booking schema.
-- btree_gist: required for the EXCLUDE USING gist constraint on bookings
--   (combines a plain equality column (bike_id) with a range overlap (&&)
--   in one exclusion constraint — the database-level double-booking guard).
-- pgtap: test framework used by supabase/tests/database/*.sql.
-- pgcrypto: gen_random_bytes(), used to generate the non-guessable
--   customer-facing booking reference.
create extension if not exists btree_gist with schema extensions;
create extension if not exists pgtap with schema extensions;
create extension if not exists pgcrypto with schema extensions;
