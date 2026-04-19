-- dossier system schema
-- run in Supabase SQL editor

create table if not exists dossiers (
  id          bigint primary key,      -- telegram_id
  full_name   text        not null,
  birth_date  text        not null,
  city        text        not null,
  phone       text        not null,
  avatar_url  text        not null default '',
  created_at  timestamptz not null default now()
);

create table if not exists user_sessions (
  telegram_id bigint primary key,
  state       text        not null,
  temp_data   jsonb       not null default '{}',
  updated_at  timestamptz not null default now()
);

-- enable RLS and allow service role full access
alter table dossiers     enable row level security;
alter table user_sessions enable row level security;

create policy "service role full access on dossiers"
  on dossiers for all
  using (true)
  with check (true);

create policy "service role full access on user_sessions"
  on user_sessions for all
  using (true)
  with check (true);

-- public read on dossiers (for API)
create policy "public read dossiers"
  on dossiers for select
  using (true);

-- Storage: create avatars bucket via dashboard or:
-- insert into storage.buckets (id, name, public)
-- values ('avatars', 'avatars', true)
-- on conflict do nothing;
