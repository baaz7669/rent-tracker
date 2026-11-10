-- Rent Tracker sync: run once in your Supabase project (SQL Editor → New query → paste → Run).
-- Stores only encrypted records. Row-level security: each signed-in user can see and change only their own rows.

create sequence if not exists public.rt_sync_seq;

create table if not exists public.sync_records (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null,
  collection text        not null check (collection in ('units', 'tenancies', 'payments', 'charges', 'expenses', 'settings')),
  payload    jsonb       not null,               -- { iv, ct }: AES-GCM ciphertext made on the device
  seq        bigint      not null default nextval('public.rt_sync_seq'),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists sync_records_user_seq on public.sync_records (user_id, seq);

-- Every write gets a new, higher seq so devices can ask "what changed since N?".
create or replace function public.rt_sync_bump_seq() returns trigger
language plpgsql as $$
begin
  new.seq := nextval('public.rt_sync_seq');
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists rt_sync_bump_seq on public.sync_records;
create trigger rt_sync_bump_seq before update on public.sync_records
  for each row execute function public.rt_sync_bump_seq();

-- Salt and a passphrase check value (both safe to store; the passphrase itself never leaves your devices).
create table if not exists public.sync_keys (
  user_id    uuid        primary key default auth.uid() references auth.users (id) on delete cascade,
  salt       text        not null,
  verifier   jsonb       not null,
  created_at timestamptz not null default now()
);

alter table public.sync_records enable row level security;
alter table public.sync_keys enable row level security;

drop policy if exists "own records" on public.sync_records;
create policy "own records" on public.sync_records
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own key" on public.sync_keys;
create policy "own key" on public.sync_keys
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
