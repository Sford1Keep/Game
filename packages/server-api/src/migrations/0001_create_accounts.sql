-- 0001: таблица аккаунтов (TECH-SPEC 5, сущность Account; T-003).
-- id — брендированный идентификатор из @game/shared (AccountId), со стороны БД — текст.
-- status — строка с допустимыми значениями AccountStatus (утверждён лидом, T-002).
create table accounts (
  id text primary key default gen_random_uuid()::text,
  login text not null unique,
  password_hash text not null,
  status text not null default 'active' constraint accounts_status_check check (
    status in ('active', 'suspended')
  ),
  created_at timestamptz not null default now()
);
