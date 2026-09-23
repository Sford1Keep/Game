# CHANGELOG

> Формат записи: дата, версия сборки (`0.PHASE.TASK`), список изменений по типу (Added / Changed / Fixed), ссылка на номер задачи из бэклога. Обновляется при каждом мерже в `main` — см. TECH-SPEC, раздел 8.4.
>
> В версиях ниже `TASK` — номер задачи из бэклога (T-010 → `0.1.10`). T-004 (`server-api`: создание персонажа) в работе не была, её номер пропущен.

## [Unreleased]

-

## [0.1.12] - 2026-09-23 — T-012 «`shared`: боевые типы»

### Added

- Боевые типы в `packages/shared/src/combat.ts`: `DamageInstance` (источник/цель/величина/тип урона), `StatusEffectId` (на старте — `vulnerable`), `AbilityId`, кулдаун как `{ abilityId, readyAtMs }`; экспорт через `index.ts`.
- Схема `AbilityConfig` (урон, кулдаун, дальность/радиус, накладываемый статус) и расширение `MobConfig` (HP, урон атаки, `aggroRadius`) в `packages/shared/src/content.ts`; обновлён пример `content/mobs/rust-scout.json`.
- Юнит-тесты парсинга `AbilityConfig` и обязательности `aggroRadius` из JSON (аналогично `content.test.ts` из T-009).

## [0.1.11] - 2026-09-23 — T-011 «Игровые события (`GameEvent`)»

### Added

- Схема `GameEvent` в `packages/shared/src/events.ts`: `type`, `actorId`, `payload`, `instanceId` (допустим `null` вне инстанса), `timestamp`; зарезервированные типы событий `mob.killed` и `item.looted`.
- Append-only хранилище событий в `server-api`: миграция `0002_create_game_events.sql` и функция записи (`src/events/store.ts`) — запись не перезаписывает предыдущие строки; `server-instance` в БД напрямую не пишет.
- Тесты схемы событий (`packages/shared/test/events.test.ts`) и записи в БД (`packages/server-api/test/events.test.ts`).

## [0.1.10] - 2026-09-23 — T-010 «Диагностическое логирование»

### Added

- Фабрика `createLogger(context)` на `pino` в `packages/shared/src/logging.ts`: уровень из `LOG_LEVEL` (неизвестное значение отклоняется), по умолчанию `info` в проде и `debug` в dev, `pino-pretty` в dev; контекст попадает в каждую запись; тесты (`packages/shared/test/logging.test.ts`).

### Changed

- `server-api` и `server-instance`: самодельный вывод/`console.log` заменены на логгер; в `server-api` middleware `requestId` для HTTP-запросов, в комнате `server-instance` контекст `instanceId`/`sessionId`.
- `LOG_LEVEL` зафиксирован в `.env.example`.

## [0.0.9] - 2026-09-22 — T-009 «`content`: пример конфига и фиксация формата»

### Added

- Схема контент-конфигов в `packages/shared/src/content.ts` (`ItemConfig`, `MobConfig`, парсер с проверкой целиком конфига) и тесты `packages/shared/test/content.test.ts`.
- Примеры конфигов: `content/items/scrap-machete.json`, `content/mobs/rust-scout.json`.
- Формат `/content` и структура директорий зафиксированы в `docs/PROJECT-MAP.md`.

## [0.0.8] - 2026-09-22 — T-008 «`client`: движение с локальным предсказанием»

### Added

- Слой `game-core/movement.ts`: обработка ввода → локальное предсказание движения на клиенте (без ожидания ответа сервера) → отправка `intent.move` → реконсиляция позиции при получении авторитетного state.
- Тесты предсказания/реконсиляции `packages/client/test/movement.test.ts`.

## [0.0.7] - 2026-09-22 — T-007 «`client`: подключение к инстансу и рендер персонажа»

### Added

- `net/instanceSession.ts`: подключение Phaser-клиента к Colyseus room (join) и подписка на state.
- `render/instanceScene.ts`: рендер игроков по state комнаты (плейсхолдер-примитивы, арт не требуется); слой `game-core/world.ts` отделён от рендера.

## [0.0.6] - 2026-09-22 — T-006 «`server-instance`: обработка движения (intent.move)»

### Added

- Обработчик сообщения `intent.move` в комнате (`src/messages.ts`): авторитетно применяет смещение к позиции игрока в state и рассылает обновлённое состояние подключённым.
- Тесты `intentMove.test.ts` и переиспользуемые хелперы тестирования комнаты.

## [0.0.5] - 2026-09-22 — T-005 «`server-instance`: базовая Colyseus-комната»

### Added

- Комната `baseInstanceRoom` с жизненным циклом `onCreate`/`onJoin`/`onLeave`/`onDispose` и конфигом сервера.
- State-схема комнаты с позицией (`x`, `y`) каждого подключённого игрока.
- Тесты `instanceRoom.test.ts`: игрок появляется в state при join и пропадает при leave.

## [0.0.3] - 2026-09-22 — T-003 «`server-api`: аккаунт (регистрация/вход)»

### Added

- HTTP-эндпоинты регистрации и входа; таблица `accounts` (миграция `0001_create_accounts.sql`); хеширование паролей; выдача JWT-токена сессии; конфиг и слой доступа к БД; тесты `accounts.test.ts`.

### Fixed

- Ошибка bind при старте сервера корректно прокидывается из `startServer`; дефолтный порт — 18080.

## [0.0.2] - 2026-09-22 — T-002 «`shared`: базовые типы»

### Added

- Базовые типы в `packages/shared`: `Vector2` (`geometry.ts`), идентификаторы сущностей `AccountId`/`CharacterId`/`InstanceId` (`ids.ts`), enum'ы `AccountStatus`/`CharacterStatus` (`status.ts`); экспорт из единой точки входа `index.ts`.
- Проверочные импорт-стабы в `server-api` и `client`.

## [0.0.1] - 2026-09-22 — T-001 «Инициализация монорепо»

### Added

- Корневой `package.json` с npm workspaces (`packages/*`) и скриптами `build`/`typecheck`/`test`/`lint`/`format` по всем пакетам.
- Базовый `tsconfig.base.json` (strict mode), наследуется пакетами.
- Пустые пакеты `shared`, `server-api`, `server-instance`, `client` с собственными `package.json`, `tsconfig.json` и минимальным `index.ts`.
- Конфигурация ESLint и Prettier на уровне репозитория, `.gitignore`, `.gitattributes`.
