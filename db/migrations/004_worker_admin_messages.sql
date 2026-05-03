-- Global worker <-> admin text chat (one thread per worker; not job-bound). v1: text only.

create table if not exists worker_admin_messages (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references profiles(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete restrict,
  author_role text not null check (author_role in ('worker', 'admin')),
  author_name text,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  constraint worker_admin_messages_body_not_blank check (length(btrim(body)) > 0)
);

create index if not exists worker_admin_messages_worker_id_created_at_idx
  on worker_admin_messages(worker_id, created_at);

create index if not exists worker_admin_messages_worker_id_active_idx
  on worker_admin_messages(worker_id)
  where deleted_at is null;

create index if not exists worker_admin_messages_author_role_idx
  on worker_admin_messages(author_role);

create table if not exists worker_admin_message_reads (
  worker_id uuid not null references profiles(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  reader_role text not null check (reader_role in ('worker', 'admin')),
  last_read_at timestamptz not null default now(),
  primary key (worker_id, user_id, reader_role)
);

create index if not exists worker_admin_message_reads_user_idx on worker_admin_message_reads(user_id);
create index if not exists worker_admin_message_reads_worker_idx on worker_admin_message_reads(worker_id);
