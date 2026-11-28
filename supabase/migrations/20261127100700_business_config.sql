-- business_config: a singleton row (id forced to 1) rather than a
-- key-value table, so every value is typed and constrained, and so
-- "this value doesn't exist yet" (NULL) is trivially distinguishable
-- from "this value is zero" for the Phase 8 preflight check.
--
-- Every BLOCKED-ON-CLIENT value starts NULL. Nothing here is a made-up
-- business number - see docs/privacy-data-inventory.md and the
-- project's BLOCKED ON THE CLIENT list.

create table public.business_config (
  id integer primary key default 1 check (id = 1),

  -- BLOCKED on the client - do not invent these:
  advance_percent numeric,
  security_deposit_min_paise integer,
  security_deposit_max_paise integer,
  support_phone text,
  support_email text,
  support_whatsapp text,
  business_address text,
  production_domain text,
  grievance_officer_contact text,

  -- Known from the existing legal pages, safe defaults:
  hold_minutes integer not null default 15,
  cancel_refund_percent_gt_24h numeric not null default 50,
  cancel_refund_percent_lte_24h numeric not null default 0,
  no_show_hours integer not null default 4,
  min_rental_days integer not null default 1,
  max_rental_days integer,
  refund_processing_days_min integer not null default 7,
  refund_processing_days_max integer not null default 10,

  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

comment on table public.business_config is
  'Singleton (id=1). BLOCKED-ON-CLIENT columns start NULL; the Phase 8 preflight script fails the build if any are still NULL at launch time.';

insert into public.business_config (id) values (1);

create trigger business_config_set_updated_at
  before update on public.business_config
  for each row
  execute function public.set_updated_at();

alter table public.business_config enable row level security;

-- Readable by any authenticated user (booking UI needs hold_minutes,
-- cancellation rules, etc. to show accurate terms) but NOT by anon -
-- support contact details are not public API surface until launch.
create policy "business_config_select_authenticated"
  on public.business_config for select
  to authenticated
  using (true);

create policy "business_config_update_admin"
  on public.business_config for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- No insert/delete policy: the one row is created by this migration
-- and never deleted; `id = 1` check makes a second row impossible.
