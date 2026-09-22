# PROJECT-MAP — навигация по проекту

> Обновляется при каждой задаче, которая добавляет новый модуль/директорию (см. TECH-SPEC, раздел 8.5). Цель: понять структуру проекта, открыв только этот файл.

## Корень репозитория

| Путь | Назначение |
|---|---|
| `package.json` | Корень монорепо: npm workspaces (`packages/*`), общие dev-зависимости, скрипты `typecheck` / `lint` / `format` |
| `tsconfig.base.json` | Базовый конфиг TypeScript (strict mode), наследуется каждым пакетом; `noEmit` по умолчанию — сборку включает пакет, которому нужен эмитабл |
| `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore` | Линт и форматирование на уровне репозитория (Prettier не трогает `.md`) |
| `/packages` | Весь код проекта (монорепо, npm workspaces) |
| `/content` | Контент как данные — предметы, таланты, квесты, территории, мутаторы. Формат конфигов фиксируется в момент первой задачи, которая их создаёт (см. TECH-SPEC, раздел 6) |
| `/docs` | GDD, TECH-SPEC, ROADMAP, этот файл, CHANGELOG, бэклог задач |

## `/packages`

Общая конвенция пакетов (T-001): `"type": "module"`, имя `@game/<пакет>`, точка входа `src/index.ts` (экспортируется через `exports`, чтобы пакеты подключались друг к другу типизированно по имени), `tsconfig.json` наследует корневой базовый.

| Пакет | Отвечает за | Связанные разделы TECH-SPEC | Статус |
|---|---|---|---|
| `shared` | Общие типы, схемы данных, константы, формулы — используется и клиентом, и сервером | 1, 3, 5 | Базовые типы заданы (T-002), см. структуру ниже |
| `server-api` | HTTP/REST: аккаунты, инвентарь вне боя, гильдии, аукцион, лидерборды, квестовый прогресс | 1, 2, 5 | Каркас, ждёт T-003 |
| `server-instance` | Colyseus-приложение: боевая логика, зоны, испытания, гильд-рейды (комнаты) | 1, 2, 4 | Базовая комната инстанса (T-005), см. структуру ниже |
| `client` | Phaser-клиент + отделённый от рендера слой игровой логики (game-core) | 1, 3, 9.2 | Каркас, ждёт T-007 |

## `packages/shared` — состав (T-002)

Наружу всё отдаётся только через `src/index.ts`; пакеты импортируют `@game/shared`, а не внутренние файлы.

| Модуль | Содержимое |
|---|---|
| `src/geometry.ts` | `Vector2` — позиция/смещение на 2D-плоскости зоны |
| `src/ids.ts` | `Id<K>` (брендированная строка), `AccountId` / `CharacterId` / `InstanceId` + конструкторы `toAccountId` / `toCharacterId` / `toInstanceId` на границах. Разные домены между собой не подставляются, голая `string` в `AccountId` не присваивается |
| `src/status.ts` | `AccountStatus`, `CharacterStatus` — **значения предложены исполнителем**, в GDD/TECH-SPEC не заданы, ждут утверждения лидом |

Файлы `packages/server-api/src/shared-types-stub.ts` и `packages/client/src/shared-types-stub.ts` — проверочные импорты-стабы из критерия приёмки T-002. Реальное использование заменит их в T-003/T-007, отдельной задачи на удаление не заводим.

## `packages/server-instance` — состав (T-005)

Точка входа `src/index.ts` реэкспортирует наружу комнату, state и `startServer`. Комната регистрируется в матчмейкинге под именем `INSTANCE_ROOM_NAME` (`'instance'`) — клиент подключается по нему (Colyseus SDK, `joinOrCreate`).

| Модуль | Содержимое |
|---|---|
| `src/state.ts` | Schema-классы состояния комнаты на новом API `schema()`/`t.*` (schema 5.x, без decorators): `PlayerState` (`x`, `y`), `InstanceState` (`players: MapSchema<PlayerState>`, ключ — `sessionId`), `SPAWN_POINT` — начальная позиция (`Vector2` из shared) |
| `src/rooms/baseInstanceRoom.ts` | `BaseInstanceRoom` — минимальная комната: жизненный цикл `onCreate`/`onJoin`/`onLeave`/`onDispose` (join добавляет игрока в state на спавне, leave удаляет; reconnect/auth вне скоупа Фазы 0). `intent.move` — T-006 |
| `src/config.ts` | `loadConfig`: `INSTANCE_PORT` (по умолчанию 2600), `INSTANCE_HOSTNAME` (127.0.0.1) |
| `src/index.ts` | `startServer(config)` — Server + WebSocketTransport, `define` комнаты, возврат `{ server, port }`; при прямом запуске (`npm start -w @game/server-instance`, `dev` — с watch) слушает конфиг из env |
| `test/instanceRoom.test.ts` | Интеграционный тест (node:test + `@colyseus/sdk`): два клиента заходят, видят друг друга в state, при leave игрок пропадает; сервер на порту 0 |

## `/content`

Пока пусто. Первая задача, создающая контент (Фаза 0, пример конфига), должна:
1. Зафиксировать здесь формат файлов (JSON/TS-объекты) и структуру директорий по типу контента (`items/`, `talents/`, `quests/`, `territories/`, `mutators/` и т.д.).
2. Обновить эту таблицу.

## `/docs`

| Файл | Назначение |
|---|---|
| `GETTING-STARTED.md` | Точка входа, порядок работ, роли, стек |
| `GDD-lite-v0.1.md` | Геймдизайн — источник истины по игровым системам |
| `TECH-SPEC-v0.1.md` | Архитектура, протокол, модель данных, стандарты, версионирование |
| `ROADMAP-v0.1.md` | Фазы разработки и критерии готовности |
| `PROJECT-MAP.md` | Этот файл |
| `CHANGELOG.md` | Журнал изменений по версиям сборки |
| `BACKLOG-phase-0.md` | Атомарные задачи текущей фазы (Фаза 0) |
