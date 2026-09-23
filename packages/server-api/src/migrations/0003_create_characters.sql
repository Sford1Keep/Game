-- 0003: таблица персонажей (T-004, TECH-SPEC 5).
-- id — брендированный CharacterId из @game/shared, со стороны БД — текст.
-- account_id — связь с accounts (T-003): персонаж принадлежит аккаунту, чужой недоступен.
-- class_id — ссылка на конфиг /content/classes: допустимость проверяет сервис, а не БД,
-- потому что контент меняется независимо от схемы (TECH-SPEC 6).
-- status — значения CharacterStatus (утверждены лидом, T-002).
create table characters (
  id text primary key default gen_random_uuid()::text,
  account_id text not null references accounts (id),
  name text not null,
  class_id text not null,
  status text not null default 'active' constraint characters_status_check check (
    status in ('active', 'archived')
  ),
  created_at timestamptz not null default now(),
  constraint characters_account_name_unique unique (account_id, name)
);

create index characters_account_id_idx on characters (account_id);
