-- ============================================================
-- Ledger — Esquema de Supabase (Postgres + Auth + RLS)
-- Ejecuta este script en el SQL Editor de tu proyecto Supabase.
-- ============================================================

-- ============================================================
-- LIMPIEZA: elimina versiones previas para reejecutar sin errores.
-- (drop ... cascade elimina también las políticas RLS asociadas)
-- ============================================================
drop table if exists public.app_settings cascade;
drop table if exists public.payouts cascade;
drop table if exists public.trades cascade;
drop table if exists public.accounts cascade;
drop table if exists public.profiles cascade;
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user cascade;

-- Registro de usuario (perfil) vinculado a auth.users
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text,
  first_name text,
  last_name text,
  display_name text,
  updated_at timestamptz default now()
);

-- Cuentas de trading (propio, fondeo CFD, futuros, Axi)
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'Mi cuenta',
  type text not null check (type in ('own','cfd','futures','axi')),
  broker text not null default 'Otro',
  initial_balance numeric not null default 0,
  risk_per_trade numeric not null default 1,
  start_date timestamptz not null default now(),
  status text not null default 'evaluation' check (status in ('active','evaluation','funded','failed','passed','cushion')),
  rules jsonb not null default '{}'::jsonb,
  current_stage_index int not null default 0,
  stage_start_pnl numeric not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- Operaciones (trades)
create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  date timestamptz not null default now(),
  instrument text not null default '',
  direction text not null default 'long' check (direction in ('long','short')),
  session text not null default 'other',
  r_planned numeric not null default 0,
  r_result numeric not null default 0,
  pnl numeric not null default 0,
  result text not null default 'be' check (result in ('win','loss','be')),
  notes text not null default '',
  created_at timestamptz not null default now()
);

-- Payouts (retiros)
create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  date timestamptz not null default now(),
  gross numeric not null default 0,
  split_pct numeric not null default 80,
  status text not null default 'requested' check (status in ('requested','approved','paid','rejected')),
  note text not null default '',
  created_at timestamptz not null default now()
);

-- Índices para consultas rápidas por usuario
create index if not exists idx_accounts_user on public.accounts (user_id);
create index if not exists idx_trades_user on public.trades (user_id);
create index if not exists idx_trades_account on public.trades (account_id);
create index if not exists idx_trades_date on public.trades (date);
create index if not exists idx_payouts_user on public.payouts (user_id);
create index if not exists idx_payouts_account on public.payouts (account_id);

-- ============================================================
-- Disparador: crea el perfil automáticamente al registrar un usuario
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  f_name text := coalesce(new.raw_user_meta_data->>'first_name', '');
  l_name text := coalesce(new.raw_user_meta_data->>'last_name', '');
begin
  insert into public.profiles (id, username, first_name, last_name, display_name)
  values (
    new.id,
    split_part(new.email, '@', 1),
    f_name,
    l_name,
    coalesce(new.raw_user_meta_data->>'display_name', trim(f_name || ' ' || l_name))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- RLS: cada usuario solo ve y modifica sus propios datos
-- (idempotente: elimina políticas previas antes de recrearlas)
-- ============================================================
alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.trades enable row level security;
alter table public.payouts enable row level security;

drop policy if exists "select own profile" on public.profiles;
drop policy if exists "update own profile" on public.profiles;
create policy "select own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "update own profile" on public.profiles
  for update using (auth.uid() = id);

drop policy if exists "select own accounts" on public.accounts;
drop policy if exists "insert own accounts" on public.accounts;
drop policy if exists "update own accounts" on public.accounts;
drop policy if exists "delete own accounts" on public.accounts;
create policy "select own accounts" on public.accounts
  for select using (auth.uid() = user_id);
create policy "insert own accounts" on public.accounts
  for insert with check (auth.uid() = user_id);
create policy "update own accounts" on public.accounts
  for update using (auth.uid() = user_id);
create policy "delete own accounts" on public.accounts
  for delete using (auth.uid() = user_id);

drop policy if exists "select own trades" on public.trades;
drop policy if exists "insert own trades" on public.trades;
drop policy if exists "update own trades" on public.trades;
drop policy if exists "delete own trades" on public.trades;
create policy "select own trades" on public.trades
  for select using (auth.uid() = user_id);
create policy "insert own trades" on public.trades
  for insert with check (auth.uid() = user_id);
create policy "update own trades" on public.trades
  for update using (auth.uid() = user_id);
create policy "delete own trades" on public.trades
  for delete using (auth.uid() = user_id);

drop policy if exists "select own payouts" on public.payouts;
drop policy if exists "insert own payouts" on public.payouts;
drop policy if exists "update own payouts" on public.payouts;
drop policy if exists "delete own payouts" on public.payouts;
create policy "select own payouts" on public.payouts
  for select using (auth.uid() = user_id);
create policy "insert own payouts" on public.payouts
  for insert with check (auth.uid() = user_id);
create policy "update own payouts" on public.payouts
  for update using (auth.uid() = user_id);
create policy "delete own payouts" on public.payouts
  for delete using (auth.uid() = user_id);

-- ============================================================
-- Realtime: habilita la sincronización entre dispositivos
-- (idempotente: agrega cada tabla solo si no está ya en la publicación)
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'accounts') then
    alter publication supabase_realtime add table public.accounts;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trades') then
    alter publication supabase_realtime add table public.trades;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'payouts') then
    alter publication supabase_realtime add table public.payouts;
  end if;
end;
$$;

-- ============================================================
-- Configuración por usuario (tema, preferencias) — opcional
-- ============================================================
create table if not exists public.app_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (user_id, key)
);
alter table public.app_settings enable row level security;
drop policy if exists "select own settings" on public.app_settings;
drop policy if exists "insert own settings" on public.app_settings;
drop policy if exists "update own settings" on public.app_settings;
drop policy if exists "delete own settings" on public.app_settings;
create policy "select own settings" on public.app_settings for select using (auth.uid() = user_id);
create policy "insert own settings" on public.app_settings for insert with check (auth.uid() = user_id);
create policy "update own settings" on public.app_settings for update using (auth.uid() = user_id);
create policy "delete own settings" on public.app_settings for delete using (auth.uid() = user_id);
