-- Shift chat / job notes (job-bound thread)

create table if not exists job_messages (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  author_id uuid not null,
  author_role text not null check (author_role in ('admin', 'worker')),
  body text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);

create index if not exists job_messages_job_id_created_at_idx on job_messages(job_id, created_at);

create table if not exists job_message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references job_messages(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  storage_path text not null,
  public_url text,
  mime_type text not null,
  file_name text,
  file_size_bytes bigint not null,
  kind text not null check (kind in ('image', 'video')),
  created_at timestamptz not null default now()
);

create index if not exists job_message_attachments_message_id_idx on job_message_attachments(message_id);
create index if not exists job_message_attachments_job_id_idx on job_message_attachments(job_id);
