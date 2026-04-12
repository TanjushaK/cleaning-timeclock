-- Persistent i18n for admin-managed site and worker fields (RU = source; EN/UK/NL derived).
-- Run in Supabase SQL editor or via migration tooling.

alter table if exists sites
  add column if not exists name_i18n jsonb not null default '{}'::jsonb;

alter table if exists sites
  add column if not exists address_i18n jsonb not null default '{}'::jsonb;

alter table if exists sites
  add column if not exists notes_i18n jsonb not null default '{}'::jsonb;

alter table if exists profiles
  add column if not exists full_name_i18n jsonb not null default '{}'::jsonb;

alter table if exists profiles
  add column if not exists notes_i18n jsonb not null default '{}'::jsonb;
