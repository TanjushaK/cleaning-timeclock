create extension if not exists pgcrypto;

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  phone text unique,
  password_hash text,
  email_confirmed_at timestamptz,
  phone_confirmed_at timestamptz,
  user_metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists refresh_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  user_agent text,
  ip text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists refresh_sessions_user_id_idx on refresh_sessions(user_id);
create index if not exists refresh_sessions_expires_at_idx on refresh_sessions(expires_at);

create table if not exists password_recovery_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  code_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists password_recovery_tokens_user_id_idx on password_recovery_tokens(user_id);

create table if not exists sms_otp_codes (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists sms_otp_codes_phone_idx on sms_otp_codes(phone);

create table if not exists profiles (
  id uuid primary key,
  role text,
  active boolean default false,
  full_name text,
  email text,
  phone text,
  avatar_url text,
  avatar_path text,
  photo_path text,
  notes text,
  onboarding_submitted_at timestamptz,
  full_name_i18n jsonb not null default '{}'::jsonb,
  notes_i18n jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists profiles_role_idx on profiles(role);
create index if not exists profiles_active_idx on profiles(active);

create table if not exists sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  lat double precision,
  lng double precision,
  radius integer,
  category integer,
  notes text,
  photos jsonb not null default '[]'::jsonb,
  archived_at timestamptz,
  name_i18n jsonb not null default '{}'::jsonb,
  address_i18n jsonb not null default '{}'::jsonb,
  notes_i18n jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sites_archived_at_idx on sites(archived_at);

create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null,
  worker_id uuid not null,
  extra_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(site_id, worker_id)
);
create index if not exists assignments_worker_id_idx on assignments(worker_id);
create index if not exists assignments_site_id_idx on assignments(site_id);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  site_id uuid,
  worker_id uuid,
  job_date date,
  scheduled_time time,
  scheduled_end_time time,
  status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists jobs_site_id_idx on jobs(site_id);
create index if not exists jobs_worker_id_idx on jobs(worker_id);
create index if not exists jobs_job_date_idx on jobs(job_date);

create table if not exists job_workers (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null,
  worker_id uuid not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(job_id, worker_id)
);
create index if not exists job_workers_job_id_idx on job_workers(job_id);
create index if not exists job_workers_worker_id_idx on job_workers(worker_id);

create table if not exists time_logs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid,
  worker_id uuid,
  started_at timestamptz,
  stopped_at timestamptz,
  start_lat double precision,
  start_lng double precision,
  start_accuracy double precision,
  stop_lat double precision,
  stop_lng double precision,
  stop_accuracy double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists time_logs_job_id_idx on time_logs(job_id);
create index if not exists time_logs_worker_id_idx on time_logs(worker_id);

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists app_users_set_updated_at on app_users;
create trigger app_users_set_updated_at before update on app_users for each row execute function set_updated_at();

drop trigger if exists refresh_sessions_set_updated_at on refresh_sessions;
create trigger refresh_sessions_set_updated_at before update on refresh_sessions for each row execute function set_updated_at();

drop trigger if exists profiles_set_updated_at on profiles;
create trigger profiles_set_updated_at before update on profiles for each row execute function set_updated_at();

drop trigger if exists sites_set_updated_at on sites;
create trigger sites_set_updated_at before update on sites for each row execute function set_updated_at();

drop trigger if exists assignments_set_updated_at on assignments;
create trigger assignments_set_updated_at before update on assignments for each row execute function set_updated_at();

drop trigger if exists jobs_set_updated_at on jobs;
create trigger jobs_set_updated_at before update on jobs for each row execute function set_updated_at();

drop trigger if exists job_workers_set_updated_at on job_workers;
create trigger job_workers_set_updated_at before update on job_workers for each row execute function set_updated_at();

drop trigger if exists time_logs_set_updated_at on time_logs;
create trigger time_logs_set_updated_at before update on time_logs for each row execute function set_updated_at();
