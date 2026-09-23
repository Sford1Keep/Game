import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { Client } from '@colyseus/sdk';

import type { CombatantKind, DamageInstance, StatusEffectId } from '@game/shared';

import { loadAbilityCatalog } from '../src/abilityCatalog.js';
import { loadClassCatalog } from '../src/classCatalog.js';
import { loadConfig } from '../src/config.js';
import { INSTANCE_ROOM_NAME, startServer, type RunningInstanceServer } from '../src/index.js';
import { loadMobCatalog } from '../src/mobCatalog.js';
import { BaseInstanceRoom, MOB_SPAWNS, PLAYER_CLASS_ID } from '../src/rooms/baseInstanceRoom.js';
import { InstanceState, type MobState, type StatusEffectState } from '../src/state.js';
import { waitFor } from './helpers.js';

/**
 * Интеграция урона (T-016): комнаты, клиенты и репликация state — настоящие;
 * подменены только часы комнаты (шов `BaseInstanceRoom.now`). Время двигает
 * тест, поэтому срок метки и готовность кулдаунов проверяются дискретно, а
 * `expiresAtMs` предсказуем до миллисекунды.
 */

let running: RunningInstanceServer;
let url: string;

let fakeNowMs = 1_000_000;
const advance = (ms: number): void => {
  fakeNowMs += ms;
};

/** Пара реальных тиков AI (см. `MOB_TICK_MS`) — чтобы убедиться, что без хода часов ничего не сгорело. */
const SETTLE_MS = 350;

const VULNERABLE: StatusEffectId = 'vulnerable';

/** Числа сравнения — только из `/content`: в тесте нет ни одной баланс-константы. */
const requireNumber = (value: number | undefined, what: string): number => {
  if (value === undefined) {
    assert.fail(`в конфиге нет значения: ${what}`);
  }
  return value;
};

const abilities = loadAbilityCatalog();
const mobs = loadMobCatalog();
const spawn = MOB_SPAWNS[0] as { mobId: string; x: number; y: number };
/** `RoomEntityId` единственного спавна: нумерация — как в `spawnMob` (T-015). */
const ENTITY_ID = `${spawn.mobId}#1`;

const marker = abilities.get('marker-shot');
const jab = abilities.get('rust-jab');
const mobConfig = mobs.get(spawn.mobId);

const MOB_HP = requireNumber(mobConfig?.hp, `${spawn.mobId}.hp`);
const MOB_DAMAGE = requireNumber(mobConfig?.damage, `${spawn.mobId}.damage`);
const MOB_ATTACK_INTERVAL_MS = requireNumber(
  mobConfig?.attackIntervalMs,
  `${spawn.mobId}.attackIntervalMs`,
);
const MARKER_DAMAGE = requireNumber(marker?.damage, 'marker-shot.damage');
const MARKER_RANGE = requireNumber(marker?.range, 'marker-shot.range');
const MARKER_COOLDOWN_MS = requireNumber(marker?.cooldownMs, 'marker-shot.cooldownMs');
const VULNERABLE_MS = requireNumber(marker?.appliesStatus?.durationMs, 'durationMs статуса');
const VULNERABLE_MULTIPLIER = requireNumber(
  marker?.appliesStatus?.damageMultiplier,
  'damageMultiplier статуса',
);
const JAB_DAMAGE = requireNumber(jab?.damage, 'rust-jab.damage');
const JAB_RANGE = requireNumber(jab?.range, 'rust-jab.range');
const JAB_COOLDOWN_MS = requireNumber(jab?.cooldownMs, 'rust-jab.cooldownMs');
const PLAYER_MAX_HP = requireNumber(
  loadClassCatalog().get(PLAYER_CLASS_ID)?.maxHp,
  'melee-initiate.maxHp',
);

/** Вплотную: внутри и `range` джеба, и агро — сервер обязан сам найти цель. */
const NEAR_DISTANCE = JAB_RANGE - 0.5;
/** Промах: дальше `range` обеих способностей и дальше `resetRadius` — моб не цепляется. */
const FAR_DISTANCE = MARKER_RANGE + 2;

before(async () => {
  // Комнату создаёт матчмейкер, поэтому часы подставляются в статику до startServer.
  BaseInstanceRoom.now = () => fakeNowMs;
  running = await startServer(loadConfig({ INSTANCE_PORT: '0', LOG_LEVEL: 'silent' }));
  url = `ws://127.0.0.1:${running.port}`;
});

after(async () => {
  await running.server.gracefullyShutdown(false);
  BaseInstanceRoom.now = () => Date.now();
});

const join = async () => new Client(url).joinOrCreate(INSTANCE_ROOM_NAME, undefined, InstanceState);

type Room = Awaited<ReturnType<typeof join>>;
type MobStateInstance = InstanceType<typeof MobState>;
type StatusEffectStateInstance = InstanceType<typeof StatusEffectState>;

const mobOf = (room: Room): MobStateInstance | undefined => room.state.mobs.get(ENTITY_ID);

/** Игрок и единственный спавн видны клиенту: дальше читаем авторитетные позиции. */
const waitSynced = async (room: Room): Promise<void> => {
  await waitFor(
    () => room.state.players.has(room.sessionId) && mobOf(room) !== undefined,
    'игрок или моб не появились в state после join',
  );
};

const hpOf = (value: number | undefined, what: string): number => {
  assert.ok(value !== undefined, `${what} нет в state клиента`);
  return value;
};

const mobHp = (room: Room): number => hpOf(mobOf(room)?.hp, 'hp моба');
const playerHp = (room: Room): number =>
  hpOf(room.state.players.get(room.sessionId)?.hp, 'hp игрока');
const playerX = (room: Room): number => hpOf(room.state.players.get(room.sessionId)?.x, 'x игрока');

const vulnerableOf = (room: Room): StatusEffectStateInstance | undefined =>
  mobOf(room)?.statuses.get(VULNERABLE);

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Встаёт на `distance` левее моба и дожидается авторитетной позиции: сервер
 * выбирает цель по своей координате, поэтому сверять нужно со state, а не с тем,
 * что отправили (TECH-SPEC 4).
 */
const standFromMob = async (room: Room, distance: number): Promise<void> => {
  const mob = mobOf(room);
  assert.ok(mob, 'моб не появился в state');
  const targetX = mob.x - distance;
  room.send('intent.move', { dx: targetX - playerX(room), dy: 0 });
  await waitFor(() => Math.abs(playerX(room) - targetX) < 1e-9, `игрок не встал в x=${targetX}`);
};

/** Активация и ожидание авторитетной просадки hp моба: урон сервер наносит в том же обработчике. */
const castMob = async (room: Room, abilityId: string): Promise<number> => {
  const before = mobHp(room);
  room.send('intent.ability', { abilityId });
  await waitFor(() => mobHp(room) < before, `hp моба не опустился с ${before} от ${abilityId}`);
  return before - mobHp(room);
};

/**
 * События только про этого клиента: broadcast идёт всем в комнате, а сосед по
 * комнате (например, игрок ещё не дописанного leave) к нашим выстрелам отношения
 * не имеет.
 */
const myEvents = (
  room: Room,
  events: readonly DamageInstance[],
  kind: CombatantKind,
): DamageInstance[] =>
  events.filter((event) =>
    kind === 'player'
      ? event.target.kind === 'player' && event.target.entityId === room.sessionId
      : event.target.kind === 'mob' && event.source.entityId === room.sessionId,
  );

/** Сумма урона по нам — сверка с просадкой hp: второго места, где hp падает, у комнаты нет. */
const damageTaken = (room: Room, events: readonly DamageInstance[]): number =>
  myEvents(room, events, 'player').reduce((sum, event) => sum + event.amount, 0);

test('vulnerable: один и тот же входящий урон даёт разный hp моба до метки и после', async () => {
  const room = await join();
  await waitSynced(room);
  const events: DamageInstance[] = [];
  room.onMessage<DamageInstance>('event.damage', (event) => {
    events.push(event);
  });
  assert.equal(mobHp(room), MOB_HP, 'моб обязан быть целым до первого удара');

  await standFromMob(room, NEAR_DISTANCE);

  const baseHit = await castMob(room, 'rust-jab');
  const hits = myEvents(room, events, 'mob');
  assert.equal(baseHit, JAB_DAMAGE, 'без метки — базовый damage из конфига');
  assert.equal(hits.length, 1, 'одно попадание — одно событие');
  const mark = hits[0];
  assert.ok(mark);
  assert.equal(mark.source.kind, 'player');
  assert.equal(mark.source.entityId, room.sessionId, 'источник — игрок, цели на wire нет');
  assert.equal(mark.target.entityId, ENTITY_ID);
  assert.equal(mark.amount, baseHit, 'event.damage и просадка hp — из одного вызова');

  // Метка бьёт по базовой величине (множитель не для самого выстрела), дальше джеб идёт ×1.25.
  const markHit = await castMob(room, 'marker-shot');
  assert.equal(markHit, MARKER_DAMAGE, 'урон накладывающего выстрела не усиливается его же меткой');
  await waitFor(() => vulnerableOf(room) !== undefined, 'метка не появилась в state клиента');
  const status = vulnerableOf(room);
  assert.ok(status);
  assert.equal(status.damageMultiplier, VULNERABLE_MULTIPLIER, 'множитель пришёл из конфига');

  advance(JAB_COOLDOWN_MS); // джеб готов, метка (5 с) ещё активна
  const boostedHit = await castMob(room, 'rust-jab');

  assert.equal(boostedHit, JAB_DAMAGE * VULNERABLE_MULTIPLIER, 'тот же вход — усиленный итог');
  assert.ok(boostedHit > baseHit, 'hp моба опустился сильнее под меткой');
  assert.ok(vulnerableOf(room), 'метка переживает второй удар');

  await room.leave(true);
});

test('vulnerable сгорает по инжектированным часам: метки нет в state, урон снова базовый', async () => {
  const room = await join();
  await waitSynced(room);
  // Из прошлого теста остаются активная метка и кулдаун marker-shot — переводим
  // часы за оба срока, начиная тест с чистого состояния.
  advance(VULNERABLE_MS);
  await standFromMob(room, NEAR_DISTANCE);

  const first = await castMob(room, 'marker-shot');
  assert.equal(first, MARKER_DAMAGE, 'без активной метки урон базовый');
  const castAt = fakeNowMs;
  await waitFor(() => vulnerableOf(room) !== undefined, 'метка не появилась в state клиента');
  const status = vulnerableOf(room);
  assert.ok(status);
  assert.equal(status.expiresAtMs, castAt + VULNERABLE_MS, 'срок метки — от часов комнаты');

  // Часы стоят: реальные тики AI метку не снимают — она живёт ровно durationMs.
  await sleep(SETTLE_MS);
  assert.ok(vulnerableOf(room), 'метка пропала без хода времени');

  advance(VULNERABLE_MS + 1);
  await waitFor(() => vulnerableOf(room) === undefined, 'истёкшая метка не ушла из state');

  const afterExpiry = await castMob(room, 'marker-shot');
  assert.equal(afterExpiry, MARKER_DAMAGE, 'после истечения срока множитель не действует');

  await room.leave(true);
});

test('урон по игроку идёт через то же применение урона: event.damage и просадка hp совпадают', async () => {
  const room = await join();
  await waitSynced(room);
  const events: DamageInstance[] = [];
  room.onMessage<DamageInstance>('event.damage', (event) => {
    events.push(event);
  });
  assert.equal(playerHp(room), PLAYER_MAX_HP, 'игрок входит с maxHp класса из /content');

  await standFromMob(room, NEAR_DISTANCE);
  advance(MOB_ATTACK_INTERVAL_MS);
  await waitFor(
    () => myEvents(room, events, 'player').length > 0,
    'event.damage по игроку не пришёл',
  );

  const hits = myEvents(room, events, 'player');
  const hit = hits[0];
  assert.ok(hit);
  assert.equal(hit.source.kind, 'mob');
  assert.equal(hit.source.entityId, ENTITY_ID, 'бьёт спавн моба');
  assert.equal(hit.target.entityId, room.sessionId);
  assert.equal(hit.amount, MOB_DAMAGE, 'на игроке статусов нет — множитель 1');
  assert.ok(
    hits.every((event) => event.amount === MOB_DAMAGE),
    'каждый удар моба — базовый damage из конфига',
  );
  // Просадка hp ровно равна сумме опубликованных ударов: второго места, где hp
  // игрока падает, у комнаты нет.
  await waitFor(
    () => playerHp(room) === PLAYER_MAX_HP - damageTaken(room, events),
    'hp игрока не сошёлся с суммой event.damage',
  );

  await room.leave(true);
});

test('нет цели в радиусе: ни урона, ни статуса, ни event.damage — кулдаун израсходован', async () => {
  const room = await join();
  await waitSynced(room);
  const events: DamageInstance[] = [];
  room.onMessage<DamageInstance>('event.damage', (event) => {
    events.push(event);
  });
  advance(VULNERABLE_MS + MARKER_COOLDOWN_MS);
  await standFromMob(room, FAR_DISTANCE);
  await waitFor(() => (mobOf(room)?.statuses.size ?? -1) === 0, 'старая метка не снята тиком');
  const hpBefore = mobHp(room);
  // Общая комната: до выстрелов сюда могли прийти чужие удары — считаем только свои.
  events.length = 0;

  const castAt = fakeNowMs;
  room.send('intent.ability', { abilityId: 'marker-shot' });
  room.send('intent.ability', { abilityId: 'rust-jab' });
  await sleep(SETTLE_MS);

  assert.equal(mobHp(room), hpBefore, 'по пустоту урон не идёт');
  assert.equal(events.length, 0, 'отклонённая способность не публикует event.damage');
  assert.equal(mobOf(room)?.statuses.size, 0, 'статус не накладывается без цели');
  const readyAt = room.state.players.get(room.sessionId)?.cooldowns.get('marker-shot')?.readyAtMs;
  assert.equal(
    readyAt,
    castAt + MARKER_COOLDOWN_MS,
    'выстрел вхолостую тратит кулдаун — семантика T-014 сохранена',
  );

  await room.leave(true);
});
