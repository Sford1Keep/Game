# PROJECT-MAP — навигация по проекту

> Обновляется при каждой задаче, которая добавляет новый модуль/директорию (см. TECH-SPEC, раздел 8.5). Цель: понять структуру проекта, открыв только этот файл.

## Корень репозитория

| Путь | Назначение |
|---|---|
| `package.json` | Корень монорепо: npm workspaces (`packages/*`), общие dev-зависимости, скрипты `typecheck` / `lint` / `format` |
| `tsconfig.base.json` | Базовый конфиг TypeScript (strict mode), наследуется каждым пакетом; `noEmit` по умолчанию — сборку включает пакет, которому нужен эмитабл |
| `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore` | Линт и форматирование на уровне репозитория (Prettier не трогает `.md`) |
| `/packages` | Весь код проекта (монорепо, npm workspaces) |
| `/content` | Контент как данные — предметы, таланты, квесты, территории, мутаторы. Формат зафиксирован в T-009 (JSON), см. раздел `/content` ниже |
| `/docs` | GDD, TECH-SPEC, ROADMAP, этот файл, CHANGELOG, бэклог задач |

## `/packages`

Общая конвенция пакетов (T-001): `"type": "module"`, имя `@game/<пакет>`, точка входа `src/index.ts` (экспортируется через `exports`, чтобы пакеты подключались друг к другу типизированно по имени), `tsconfig.json` наследует корневой базовый.

| Пакет | Отвечает за | Связанные разделы TECH-SPEC | Статус |
|---|---|---|---|
| `shared` | Общие типы, схемы данных, константы, формулы — используется и клиентом, и сервером | 1, 3, 5 | Базовые типы (T-002), схема контент-конфигов (T-009), см. структуру ниже |
| `server-api` | HTTP/REST: аккаунты, инвентарь вне боя, гильдии, аукцион, лидерборды, квестовый прогресс | 1, 2, 5 | Аккаунты: регистрация/вход (T-003), см. структуру ниже; остальное ждёт своих задач |
| `server-instance` | Colyseus-приложение: боевая логика, зоны, испытания, гильд-рейды (комнаты) | 1, 2, 4 | Базовая комната + движение (T-005, T-006), см. структуру ниже |
| `client` | Phaser-клиент + отделённый от рендера слой игровой логики (game-core) | 1, 3, 9.2 | Подключение, рендер и локальное предсказание движения (T-007, T-008), см. структуру ниже |


## `packages/shared` — состав (T-002, T-009)

Наружу всё отдаётся только через `src/index.ts`; пакеты импортируют `@game/shared`, а не внутренние файлы.

| Модуль | Содержимое |
|---|---|
| `src/geometry.ts` | `Vector2` — позиция/смещение на 2D-плоскости зоны |
| `src/ids.ts` | `Id<K>` (брендированная строка), `AccountId` / `CharacterId` / `InstanceId` + конструкторы `toAccountId` / `toCharacterId` / `toInstanceId` на границах. Разные домены между собой не подставляются, голая `string` в `AccountId` не присваивается |
| `src/status.ts` | `AccountStatus`, `CharacterStatus` — значения предложены исполнителем, утверждены лидом при ревью T-002 |
| `src/content.ts` | Схема контент-конфигов `/content` (T-009): `ItemConfig`/`MobConfig` (id — `ItemId`/`MobId`), словари `FACTIONS`/`ITEM_KINDS`/`STAT_IDS`, парсеры `parseItemConfig`/`parseMobConfig` — граница `unknown → конфиг` (битый файл отклоняется целиком, возвращая `undefined`) |
| `test/content.test.ts` | Тестовый стаб приёмки T-009 (`tsx --test`): читаем JSON из `/content`, получаем типизированные конфиги через `@game/shared`; плюс контроль отклонения битых конфигов |


Файлы `packages/server-api/src/shared-types-stub.ts` и `packages/client/src/shared-types-stub.ts` — проверочные импорт-стабы из критерия приёмки T-002; оба удалены за ненадобностью: серверный — в T-003, клиентский — в T-007, типы теперь используются в реальном коде.

## `packages/server-api` — состав (T-003)

Запускается через `tsx` (эмита нет, `noEmit` сохранён; `tsx` транслирует и TS-исходники `@game/shared` с enum'ами). Скрипты пакета: `dev` / `start` / `test`. Конфигурация — окружение (`DATABASE_URL`, `JWT_SECRET`, `PORT`), пример в `packages/server-api/.env.example`. Локальный dev-кластер PostgreSQL поднимается в `.local/pgdata` (порт 5433, каталог в `.gitignore`), команды — в том же `.env.example`.

| Модуль | Содержимое |
|---|---|
| `src/config.ts` | `loadConfig(env)` — разбор конфигурации из переменных окружения |
| `src/db/migrate.ts` | Простейший runner SQL-миграций (таблица `schema_migrations`, файл = транзакция) |
| `src/migrations/0001_create_accounts.sql` | Таблица `accounts` (`id` — текст под `AccountId`, `login` unique, `password_hash`, `status` с CHECK по `AccountStatus`) |
| `src/accounts/` | Домен аккаунтов: `password.ts` (scrypt-хеширование из `node:crypto`, без нативных зависимостей), `token.ts` (JWT HS256 через `jose`, `sub` = `AccountId`), `service.ts` (регистрация/аутентификация/`resolveSession`, типизированные доменные ошибки) |
| `src/http/app.ts` | Express-приложение: `POST /accounts/register`, `POST /accounts/login`, `GET /healthz`; маппинг доменных ошибок в 400/401/403/409 |
| `src/index.ts` | Точка входа: миграции → запуск HTTP-сервера; экспорт `startServer` для тестов |
| `test/accounts.test.ts` | node:test: сквозная проверка критерия приёмки T-003 по HTTP против реального PostgreSQL |

## `packages/client` — состав (T-007, T-008)

Слои разделены по правилу TECH-SPEC 3: `game-core` не импортирует Phaser/DOM/Colyseus, `net` — единственный, кто знает про транспорт, `render` только читает game-core.

| Модуль | Содержимое |
|---|---|
| `src/game-core/world.ts` | `WorldStore` — чистая TS-модель мира: реестр игроков (`id`, `position: Vector2`), `replace()` для снятия снапшота, `roster()` для рендера, `localId` для выделения локального игрока, `get()`/`setLocalPosition()` — чтение и локальное предсказание позиции (T-008) |
| `src/game-core/movement.ts` | `MovementController` (T-008) — локальное предсказание с реконсиляцией (TECH-SPEC 4): интеграция ввода в `position`, отправка накопленных дельт не чаще `SEND_INTERVAL_MS` (20 Гц, расписание сдвигается интервалом, а не «временем кадра»), модель `authoritative + inFlight + unsent`; выход за `SNAP_TOLERANCE` — жёсткий снап на честную оценку. Часы и отправка инжектируются (`MovementDeps`) — модуль тестируется без браузера и сети. `LOCAL_SPEED` — временная константа, числа баланса придут с `/content` (T-009) |
| `src/net/instanceSession.ts` | `connectInstance(url, room, world)` — адаптер Colyseus SDK: join комнаты, `sync()` перекладывает `state.players` в `WorldStore`, `sendMove(dx, dy)` шлёт `intent.move`. Schema состояния берётся из `@game/server-instance/state` (subpath-экспорт, чтобы не тянуть серверный код в бандл) |
| `src/render/instanceScene.ts` | Phaser 4 сцена: плейсхолдер-квадраты по позициям + HUD со списком сессий; мировые координаты → пиксели (`PX_PER_UNIT`), арт не подключается (TECH-SPEC 9.2). Локальный игрок рисуется предсказанной позицией |
| `src/main.ts` | Бутстрап: сборка слоёв, клавиатурный ввод WASD/стрелки → `MovementController`, цикл rAF (setTimeout-фолбэк для скрытой вкладки): `sync` → `onAuthoritative` → `update(dt)` → `setLocalPosition`; URL сервера `?server=...` (дефолт `ws://127.0.0.1:2600`), dev-хуки `window.__gameWorld` / `__gameSync` / `__gameSetDirection` |
| `test/movement.test.ts` | Юнит-тесты предсказания (`tsx --test`, без браузера): мгновенное предсказание, отсутствие дрейфа за 5 с, серверный телепорт перебивает предсказание, нормализация диагонали, частота отправок ~20 Гц |
| `index.html`, vite | Дев-обвязка: `npm run dev -w @game/client` |

Проверка приёмки T-007 (вручную, браузеров в тестах нет): страница `http://localhost:5173` показывает персонажа; node-клиент, зашедший вторым, появляется в roster браузера и исчезает при leave. Проверка T-008: в браузере предсказание сдвигает персонажа в том же кадре ввода; после остановки авторитетная позиция стороннего node-обсервера совпадает с предсказанной (дрейфа нет).

## `packages/server-instance` — состав (T-005, T-006)

Точка входа `src/index.ts` реэкспортирует наружу комнату, state, сообщения и `startServer`. Комната регистрируется в матчмейкинге под именем `INSTANCE_ROOM_NAME` (`'instance'`) — клиент подключается по нему (Colyseus SDK, `joinOrCreate`).

| Модуль | Содержимое |
|---|---|
| `src/state.ts` | Schema-классы состояния комнаты на новом API `schema()`/`t.*` (schema 5.x, без decorators): `PlayerState` (`x`, `y`), `InstanceState` (`players: MapSchema<PlayerState>`, ключ — `sessionId`), `SPAWN_POINT` — начальная позиция (`Vector2` из shared) |
| `src/rooms/baseInstanceRoom.ts` | `BaseInstanceRoom` — комната инстанса: жизненный цикл `onCreate`/`onJoin`/`onLeave`/`onDispose` (join добавляет игрока на спавне, leave удаляет; reconnect/auth вне скоупа Фазы 0) + обработчик `intent.move` (T-006): сервер авторитетно применяет валидное смещение к позиции, state sync расходится встроенным механизмом (TECH-SPEC 4) |
| `src/messages.ts` | Прикладные client→server намерения: `MoveIntent` (`dx`/`dy`) и `parseMoveIntent` — чистая валидация payload (мусор/NaN/Infinity отклоняются без изменения позиции) |
| `src/config.ts` | `loadConfig`: `INSTANCE_PORT` (по умолчанию 2600), `INSTANCE_HOSTNAME` (127.0.0.1) |
| `src/index.ts` | `startServer(config)` — Server + WebSocketTransport, `define` комнаты, возврат `{ server, port }`; при прямом запуске (`npm start -w @game/server-instance`, `dev` — с watch) слушает конфиг из env |
| `test/instanceRoom.test.ts`, `test/intentMove.test.ts`, `test/helpers.ts` | Интеграционные тесты (node:test + `@colyseus/sdk`, сервер на порту 0): join/leave видимость в state; `intent.move` доходит до остальных, невалидный payload отклоняется; `waitFor` — опрос асинхронного state sync |

## `/content` — формат (зафиксирован в T-009)

Контент — данные, не код (TECH-SPEC 6): логика читает конфиги и применяет универсальные правила; числа баланса живут здесь, а не в модулях логики.

| Аспект | Формат |
|---|---|
| Файл | JSON, UTF-8, один файл = одна сущность |
| Директории | По типу контента: `items/`, `mobs/`; новые типы (talents/, quests/, territories/, mutators/) добавляются той же конвенцией |
| Имя файла | `id` сущности (`items/scrap-machete.json` → `"id": "scrap-machete"`); `id` стабилен — на него ссылаются дроп/инвентарь/арт |
| Схема | Типы и парсеры — `packages/shared/src/content.ts` (`ItemConfig`, `MobConfig`); файл, не прошедший парсер, бракуется целиком |
| Арт | Через необязательный `spriteId`; арта может не быть — рендерит плейсхолдер (TECH-SPEC 9.2) |
| Примеры | `items/scrap-machete.json` (оружие с фракционным аффиксом), `mobs/rust-scout.json` (моб фракции техно) |
| Проверка | `npm test -w @game/shared` — тестовый стаб читает примеры и валидирует их через shared |

Читатели конфигов (загрузка на старте сервера/клиента) подключаются в задачах, которым они нужны, — сам формат от этого не меняется.

## `/docs`

| Файл | Назначение |
|---|---|
| `GETTING-STARTED.md` | Точка входа, порядок работ, роли, стек |
| `GDD-lite-v0.1.md` | Геймдизайн — источник истины по игровым системам |
| `TECH-SPEC-v0.1.md` | Архитектура, протокол, модель данных, стандарты, версионирование |
| `ROADMAP-v0.1.md` | Фазы разработки и критерии готовности |
| `PROJECT-MAP.md` | Этот файл |
| `CHANGELOG.md` | Журнал изменений по версиям сборки |
| `BACKLOG-phase-0.md` | Атомарные задачи фазы 0 (закрыта, смержена в `main`) |
| `BACKLOG-phase-1.md` | Атомарные задачи фазы 1 — боёвое ядро (`T-010`…`T-019`), ветка `phase/1-combat-core` |
