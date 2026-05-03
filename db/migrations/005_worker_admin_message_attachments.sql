-- Worker <-> admin chat: optional message body + photo attachments (max enforced in API).

alter table worker_admin_messages drop constraint if exists worker_admin_messages_body_not_blank;
alter table worker_admin_messages alter column body drop not null;

create table if not exists worker_admin_message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references worker_admin_messages(id) on delete cascade,
  worker_id uuid not null references profiles(id) on delete cascade,
  uploader_id uuid not null references profiles(id) on delete restrict,
  uploader_role text not null check (uploader_role in ('worker', 'admin')),
  path text not null,
  mime_type text,
  size_bytes integer,
  created_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create index if not exists worker_admin_message_attachments_message_id_idx
  on worker_admin_message_attachments(message_id);

create index if not exists worker_admin_message_attachments_worker_id_idx
  on worker_admin_message_attachments(worker_id);

create index if not exists worker_admin_message_attachments_created_at_idx
  on worker_admin_message_attachments(created_at);
