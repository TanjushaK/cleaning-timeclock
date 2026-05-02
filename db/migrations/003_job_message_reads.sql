-- Per-user read pointer for shift chat (job messages)

create table if not exists job_message_reads (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  user_id uuid not null,
  reader_role text not null check (reader_role in ('admin','worker')),
  last_read_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(job_id, user_id)
);

create index if not exists job_message_reads_job_id_idx on job_message_reads(job_id);
create index if not exists job_message_reads_user_id_idx on job_message_reads(user_id);
create index if not exists job_message_reads_job_id_reader_role_idx on job_message_reads(job_id, reader_role);
