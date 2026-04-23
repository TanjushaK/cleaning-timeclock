-- Account deletion requests initiated by workers (Apple Guideline 5.1.1(v)).
-- Processed asynchronously by operator; not an immediate hard-delete.

create table if not exists account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'cancelled')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists account_deletion_requests_user_id_idx on account_deletion_requests (user_id);
create index if not exists account_deletion_requests_status_idx on account_deletion_requests (status);
create index if not exists account_deletion_requests_created_at_idx on account_deletion_requests (created_at desc);

drop trigger if exists account_deletion_requests_set_updated_at on account_deletion_requests;
create trigger account_deletion_requests_set_updated_at
before update on account_deletion_requests
for each row execute function set_updated_at();
