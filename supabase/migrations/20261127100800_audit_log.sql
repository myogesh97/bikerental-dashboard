-- audit_log: populated by a trigger, not by application code
-- remembering to call a logging function, so it cannot be silently
-- skipped by a new code path. Covers every admin-writable table.

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id),
  action text not null, -- 'INSERT' | 'UPDATE' | 'DELETE'
  table_name text not null,
  -- text, not uuid: business_config's PK is an integer (singleton,
  -- id=1), so row_id must work for any primary key type, not just uuid.
  row_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_table_row_idx on public.audit_log (table_name, row_id);
create index audit_log_actor_idx on public.audit_log (actor_id);

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_id_value text;
begin
  row_id_value := (case when TG_OP = 'DELETE' then old.id else new.id end)::text;

  insert into public.audit_log (actor_id, action, table_name, row_id, before, after)
  values (
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    row_id_value,
    case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when TG_OP in ('UPDATE', 'INSERT') then to_jsonb(new) else null end
  );

  return coalesce(new, old);
end;
$$;

create trigger bikes_audit
  after insert or update or delete on public.bikes
  for each row execute function public.write_audit_log();

create trigger bike_blocks_audit
  after insert or update or delete on public.bike_blocks
  for each row execute function public.write_audit_log();

create trigger bookings_audit
  after update on public.bookings
  for each row execute function public.write_audit_log();

create trigger business_config_audit
  after update on public.business_config
  for each row execute function public.write_audit_log();

alter table public.audit_log enable row level security;

-- Admin-only read. No write policy at all for any role - the only
-- writer is the SECURITY DEFINER trigger function above, which runs
-- with the privileges of its definer (postgres), not the caller's,
-- so RLS on this table never blocks the trigger itself.
create policy "audit_log_select_admin"
  on public.audit_log for select
  to authenticated
  using (public.is_admin());
