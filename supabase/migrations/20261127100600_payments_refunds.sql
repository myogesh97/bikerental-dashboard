-- payments / refunds: append-only per attempt. A booking can have more
-- than one payments row over its life (a failed attempt, then a
-- successful one) - rows are never edited in place except for status
-- transitions driven by the Razorpay webhook (Phase 4), so the full
-- history of what Razorpay actually said is preserved for reconciliation.

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id),
  razorpay_order_id text unique,
  razorpay_payment_id text unique,
  amount_paise integer not null check (amount_paise > 0),
  currency text not null default 'INR',
  status text not null default 'created' check (
    status in ('created', 'authorized', 'captured', 'failed', 'refunded')
  ),
  last_webhook_event_id text, -- for idempotency: the last Razorpay event id processed for this row
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.payments is
  'Never stores card/UPI/bank details - Razorpay Checkout.js handles those directly with Razorpay.';

create index payments_booking_id_idx on public.payments (booking_id);

create trigger payments_set_updated_at
  before update on public.payments
  for each row
  execute function public.set_updated_at();

alter table public.payments enable row level security;

create policy "payments_select_own_or_admin"
  on public.payments for select
  to authenticated
  using (
    exists (
      select 1 from public.bookings bk
      where bk.id = payments.booking_id and bk.customer_id = auth.uid()
    )
    or public.is_admin()
  );

-- No client insert/update policy: payments rows are written only by
-- the create-payment-order and razorpay-webhook Edge Functions, which
-- use the service_role key (bypasses RLS by design - that's the one
-- place a Razorpay-driven write is trusted).

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id),
  booking_id uuid not null references public.bookings (id),
  amount_paise integer not null check (amount_paise > 0),
  razorpay_refund_id text unique,
  reason text not null,
  status text not null default 'initiated' check (status in ('initiated', 'processed', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index refunds_booking_id_idx on public.refunds (booking_id);

create trigger refunds_set_updated_at
  before update on public.refunds
  for each row
  execute function public.set_updated_at();

alter table public.refunds enable row level security;

create policy "refunds_select_own_or_admin"
  on public.refunds for select
  to authenticated
  using (
    exists (
      select 1 from public.bookings bk
      where bk.id = refunds.booking_id and bk.customer_id = auth.uid()
    )
    or public.is_admin()
  );

-- No client insert/update policy: refunds are written only by
-- server-side functions (cancel_booking, the webhook's late-payment
-- branch), via service_role.
