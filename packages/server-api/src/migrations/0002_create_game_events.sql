-- 0002: игровые события (TECH-SPEC 5, 10.2; T-011).
-- Append-only источник правды для статистики/экономики/античита: строки только
-- добавляются, UPDATE и DELETE запрещены триггером ниже.
-- Поля соответствуют GameEvent из @game/shared; shared-ное `timestamp` живёт в
-- колонке occurred_at, чтобы не теряться среди служебных timestamptz.
create table game_events (
  id text primary key default gen_random_uuid()::text,
  type text not null constraint game_events_type_check check (
    type in ('mob.killed', 'item.looted')
  ),
  actor_id text not null,
  instance_id text,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now()
);

-- Основные вопросы к этому объёму данных: «что делал персонаж» и «сколько мобов
-- умерело в инстансе» — индексы под них.
create index game_events_actor_idx on game_events (actor_id, occurred_at);
create index game_events_instance_idx on game_events (instance_id, occurred_at);

create function game_events_forbid_mutation() returns trigger
language plpgsql as $function$
begin
  raise exception 'game_events: % запрещён, таблица append-only', tg_op;
end;
$function$;

create trigger game_events_no_mutation
before
update or delete on game_events for each row
execute function game_events_forbid_mutation();
