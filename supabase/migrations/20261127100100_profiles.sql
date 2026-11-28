-- profiles: one row per auth.users row, created by trigger on signup.
-- role is a trust boundary: it must never be settable by the user it
-- belongs to, only by a migration/service_role session (see the
-- trigger at the bottom of this file).

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  dob date, -- self-declared; NOT a verified age check (see docs/privacy-data-inventory.md)
  role text not null default 'customer' check (role in ('customer', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'One row per auth.users row. role is a trust boundary - see prevent_role_self_update trigger.';
comment on column public.profiles.dob is
  'Self-declared date of birth for the 21+ eligibility check. Not a verified age check - the real check happens against a physical ID at pickup.';

-- updated_at maintenance
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- Auto-create a profile row when a new auth.users row is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Reject any attempt to change `role` from a normal client session.
-- Only a service_role (or superuser, e.g. a migration run by the CLI)
-- session can change it. This is enforced here independently of RLS
-- policy wording, so a too-permissive policy can never be enough on
-- its own to let a customer grant themselves admin.
create or replace function public.prevent_role_self_update()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role and auth.role() <> 'service_role' then
    raise exception 'role cannot be changed from a client session';
  end if;
  return new;
end;
$$;

create trigger profiles_prevent_role_self_update
  before update on public.profiles
  for each row
  execute function public.prevent_role_self_update();

-- Reusable "is the current session an admin" check, used by every
-- "own row OR admin" policy on every table in this schema. security
-- definer + a fixed search_path so it can read profiles.role
-- regardless of the caller's own RLS visibility into profiles, without
-- being hijacked by a search_path trick.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

alter table public.profiles enable row level security;

-- Default deny: no policy below grants anon anything on this table.

create policy "profiles_select_own_or_admin"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

create policy "profiles_update_own_or_admin"
  on public.profiles for update
  to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- No insert policy: rows are created only by the handle_new_user trigger
-- (security definer), never directly by a client.
-- No delete policy: profiles are deleted via auth.users cascade only.
