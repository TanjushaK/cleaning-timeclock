-- Expo push tokens for worker devices (admin chat notifications).

create table if not exists worker_push_tokens (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references profiles(id) on delete cascade,
  token text not null,
  platform text null,
  device_name text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  disabled_at timestamptz null,
  unique(worker_id, token)
);

create index if not exists worker_push_tokens_worker_id_active_idx
  on worker_push_tokens(worker_id)
  where disabled_at is null;
