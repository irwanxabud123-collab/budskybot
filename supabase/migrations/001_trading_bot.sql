create extension if not exists pgcrypto;

create table if not exists public.trades (
  wallet_public_key text not null,
  trade_id text primary key,
  signal_id text not null,
  execution_id text not null unique,
  idempotency_key text not null unique,
  state text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  signature text,
  error text,
  request_id text,
  transaction text,
  realized_pnl_usd numeric,
  fee_usd numeric,
  notional_usd numeric,
  execution_slippage_bps numeric,
  position_id text,
  trade_side text,
  position_quantity_raw text,
  intent jsonb not null,
  quote jsonb
);

create table if not exists public.bot_events (
  id uuid primary key,
  event_type text not null,
  timestamp_ms bigint not null,
  data jsonb not null
);

create table if not exists public.execution_leases (
  idempotency_key text primary key,
  trade_id text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);


-- Upgrade path for databases created by the earlier schema.
alter table public.trades add column if not exists wallet_public_key text;
alter table public.trades add column if not exists transaction text;
alter table public.trades add column if not exists realized_pnl_usd numeric;
alter table public.trades add column if not exists fee_usd numeric;
alter table public.trades add column if not exists notional_usd numeric;
alter table public.trades add column if not exists execution_slippage_bps numeric;
alter table public.trades add column if not exists position_id text;
alter table public.trades add column if not exists trade_side text;
alter table public.trades add column if not exists position_quantity_raw text;
update public.trades set wallet_public_key = coalesce(wallet_public_key, intent->>'walletPublicKey') where wallet_public_key is null;

create index if not exists trades_wallet_state_idx on public.trades(wallet_public_key,state);
create index if not exists trades_state_idx on public.trades(state);
create index if not exists trades_created_idx on public.trades(created_at desc);
create index if not exists trades_position_idx on public.trades(position_id,trade_side,state);
create index if not exists bot_events_type_idx on public.bot_events(event_type);

alter table public.trades enable row level security;
alter table public.bot_events enable row level security;
alter table public.execution_leases enable row level security;

revoke all on public.trades from anon, authenticated;
revoke all on public.bot_events from anon, authenticated;
revoke all on public.execution_leases from anon, authenticated;


create or replace function public.claim_execution_lease(p_lock_key text, p_trade_id text, p_ttl_ms bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare claimed boolean := false;
begin
  insert into public.execution_leases(idempotency_key, trade_id, created_at, expires_at)
  values(p_lock_key, p_trade_id, now(), now() + make_interval(secs => greatest(p_ttl_ms, 1000) / 1000.0))
  on conflict (idempotency_key) do update
    set trade_id = excluded.trade_id, created_at = now(), expires_at = excluded.expires_at
    where public.execution_leases.expires_at <= now();
  select exists(select 1 from public.execution_leases where idempotency_key=p_lock_key and trade_id=p_trade_id and expires_at>now()) into claimed;
  return jsonb_build_object('claimed', claimed);
end; $$;

create or replace function public.release_execution_lease(p_lock_key text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  delete from public.execution_leases where idempotency_key=p_lock_key;
  select jsonb_build_object('released', true);
$$;

revoke all on function public.claim_execution_lease(text,text,bigint) from public;
revoke all on function public.release_execution_lease(text) from public;
grant execute on function public.claim_execution_lease(text,text,bigint) to service_role;
grant execute on function public.release_execution_lease(text) to service_role;


-- Durable research dataset. Netlify function filesystems are ephemeral; replay_events is the durable source.
create table if not exists public.replay_events (
  event_id uuid primary key,
  timestamp_ms bigint not null,
  event jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists replay_events_timestamp_idx on public.replay_events(timestamp_ms);
create index if not exists replay_events_trade_idx on public.replay_events((event->>'trade_id'));
create index if not exists replay_events_pair_idx on public.replay_events((event->>'pair'));
alter table public.replay_events enable row level security;
revoke all on public.replay_events from anon, authenticated;

-- Durable operator control plane. The UI can request mode changes without editing deployment env vars.
create table if not exists public.bot_control_state (
  id text primary key default 'singleton',
  mode text not null default 'PAPER' check (mode in ('PAPER','LIVE')),
  live_enabled boolean not null default false,
  emergency_stop boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text,
  version bigint not null default 0
);
insert into public.bot_control_state(id) values ('singleton') on conflict (id) do nothing;
create index if not exists bot_control_updated_idx on public.bot_control_state(updated_at desc);
alter table public.bot_control_state enable row level security;
revoke all on public.bot_control_state from anon, authenticated;
