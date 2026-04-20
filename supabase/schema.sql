create table if not exists dossiers (id bigint primary key, full_name text not null, birth_date text not null default '', city text not null default '', phone text not null default '', avatar_url text not null default '', info_text text not null default '', hidden_sections jsonb not null default '[]', created_at timestamptz not null default now());

create table if not exists user_sessions (telegram_id bigint primary key, state text not null, temp_data jsonb not null default '{}', updated_at timestamptz not null default now());

create table if not exists dossier_media (id uuid primary key default gen_random_uuid(), dossier_id bigint not null references dossiers(id) on delete cascade, section text not null check (section in ('correspondence', 'gallery')), media_type text not null default 'image' check (media_type in ('image', 'video')), url text not null, created_at timestamptz not null default now());

create index if not exists dossier_media_dossier_id_idx on dossier_media (dossier_id);

alter table dossiers enable row level security;
alter table user_sessions enable row level security;
alter table dossier_media enable row level security;

drop policy if exists "service full access dossiers" on dossiers;
drop policy if exists "service full access sessions" on user_sessions;
drop policy if exists "service full access media" on dossier_media;
drop policy if exists "public read dossiers" on dossiers;
drop policy if exists "public read media" on dossier_media;

create policy "service full access dossiers" on dossiers for all using (true) with check (true);
create policy "service full access sessions" on user_sessions for all using (true) with check (true);
create policy "service full access media" on dossier_media for all using (true) with check (true);
create policy "public read dossiers" on dossiers for select using (true);
create policy "public read media" on dossier_media for select using (true);

alter table dossiers add column if not exists info_text text not null default '';
alter table dossiers add column if not exists hidden_sections jsonb not null default '[]';
alter table dossier_media add column if not exists media_type text not null default 'image' check (media_type in ('image', 'video'));
alter table dossiers add column if not exists suspected_of text not null default '';
alter table dossiers add column if not exists username text not null default '';
alter table dossiers add column if not exists notes text not null default '';
alter table dossiers add column if not exists public_messages text not null default '';
alter table dossiers add column if not exists relatives jsonb not null default '{}';
