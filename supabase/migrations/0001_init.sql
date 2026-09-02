-- Personal Life Dashboard - optional private cloud sync
--
-- The app is fully functional without any of this. Apply these migrations only
-- if you want an encrypted-in-transit backup/sync target for a single account.
--
-- Design rules enforced here:
--   * every row is owned by exactly one authenticated user (auth.uid())
--   * row-level security is ON for every table, with per-operation policies
--     that check the authenticated user id - never a hidden UI route
--   * the service-role key is never given to the browser; only the anon key and
--     project URL (both non-secret) reach the client
--   * timestamps are server-set, so a client cannot backdate a record

create extension if not exists "pgcrypto";

-- One row per synced record, mirroring the local IndexedDB stores.
create table if not exists public.records (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  store         text not null,
  record_id     text not null,
  local_date    date,
  time_zone     text,
  payload       jsonb not null,
  schema_version integer not null default 1,
  deleted       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint records_store_check check (
    store in (
      'settings', 'targetVersions', 'taskTemplates', 'taskInstances', 'foodEntries',
      'dayNutrition', 'gymSessions', 'workoutTemplates', 'runSessions', 'stepEntries',
      'subjects', 'chapters', 'studySessions', 'studyTimer', 'dayNotes'
    )
  ),
  constraint records_record_id_length check (char_length(record_id) between 1 and 64),
  constraint records_payload_size check (pg_column_size(payload) < 262144),
  unique (user_id, store, record_id)
);

create index if not exists records_user_store_idx on public.records (user_id, store);
create index if not exists records_user_date_idx on public.records (user_id, local_date);
create index if not exists records_updated_idx on public.records (user_id, updated_at desc);

-- Server-side timestamp and ownership enforcement.
create or replace function public.records_set_meta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.user_id := auth.uid();
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists records_set_meta_trg on public.records;
create trigger records_set_meta_trg
  before insert or update on public.records
  for each row execute function public.records_set_meta();

-- Row-level security: a user can only ever see and write their own rows.
alter table public.records enable row level security;
alter table public.records force row level security;

drop policy if exists records_select_own on public.records;
create policy records_select_own on public.records
  for select using (auth.uid() = user_id);

drop policy if exists records_insert_own on public.records;
create policy records_insert_own on public.records
  for insert with check (auth.uid() = user_id);

drop policy if exists records_update_own on public.records;
create policy records_update_own on public.records
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists records_delete_own on public.records;
create policy records_delete_own on public.records
  for delete using (auth.uid() = user_id);

-- No anonymous access at all.
revoke all on public.records from anon;
grant select, insert, update, delete on public.records to authenticated;

-- Private storage for exported backups, if you choose to store them.
-- The bucket is private; objects are readable only through signed URLs.
insert into storage.buckets (id, name, public)
values ('backups', 'backups', false)
on conflict (id) do nothing;

drop policy if exists backups_own_objects on storage.objects;
create policy backups_own_objects on storage.objects
  for all
  using (bucket_id = 'backups' and owner = auth.uid())
  with check (bucket_id = 'backups' and owner = auth.uid());
