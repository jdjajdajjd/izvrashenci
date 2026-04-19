-- ============================================================
-- Запускать по частям если что-то уже существует
-- ============================================================

-- Таблица досье
create table if not exists dossiers (
  id          bigint primary key,
  full_name   text        not null,
  birth_date  text        not null,
  city        text        not null,
  phone       text        not null,
  avatar_url  text        not null default '',
  created_at  timestamptz not null default now()
);

-- Сессии бота
create table if not exists user_sessions (
  telegram_id bigint primary key,
  state       text        not null,
  temp_data   jsonb       not null default '{}',
  updated_at  timestamptz not null default now()
);

-- Медиафайлы (переписка и галерея)
create table if not exists dossier_media (
  id          uuid        primary key default gen_random_uuid(),
  dossier_id  bigint      not null references dossiers(id) on delete cascade,
  section     text        not null check (section in ('correspondence', 'gallery')),
  url         text        not null,
  created_at  timestamptz not null default now()
);

create index if not exists dossier_media_dossier_id_idx
  on dossier_media (dossier_id);

-- RLS
alter table dossiers      enable row level security;
alter table user_sessions enable row level security;
alter table dossier_media enable row level security;

-- Политики (drop before create чтобы не было конфликтов)
drop policy if exists "service full access dossiers"  on dossiers;
drop policy if exists "service full access sessions"  on user_sessions;
drop policy if exists "service full access media"     on dossier_media;
drop policy if exists "public read dossiers"          on dossiers;
drop policy if exists "public read media"             on dossier_media;

-- Старые названия на случай если были созданы раньше
drop policy if exists "service role full access on dossiers"       on dossiers;
drop policy if exists "service role full access on user_sessions"  on user_sessions;

create policy "service full access dossiers"
  on dossiers for all using (true) with check (true);

create policy "service full access sessions"
  on user_sessions for all using (true) with check (true);

create policy "service full access media"
  on dossier_media for all using (true) with check (true);

create policy "public read dossiers"
  on dossiers for select using (true);

create policy "public read media"
  on dossier_media for select using (true);
