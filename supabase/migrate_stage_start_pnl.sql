-- ============================================================
-- Migración no destructiva: agrega el campo "stage_start_pnl"
-- (punto de partida de la etapa actual) a la tabla accounts.
--
-- Este script NO borra ningún dato. Aplícalo en el SQL Editor de
-- Supabase si ya tienes datos y no quieres reejecutar todo el schema.
-- ============================================================

alter table public.accounts
  add column if not exists stage_start_pnl numeric not null default 0;
