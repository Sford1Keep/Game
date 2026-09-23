import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { Client } from '@colyseus/sdk';

import { loadMobCatalog } from '../src/mobCatalog.js';
import { loadClassCatalog } from '../src/classCatalog.js';
import { loadConfig } from '../src/config.js';
import { INSTANCE_ROOM_NAME, startServer, type RunningInstanceServer } from '../src/index.js';
import { MOB_SPAWNS, PLAYER_CLASS_ID } from '../src/rooms/baseInstanceRoom.js';
import { InstanceState } from '../src/state.js';
import { waitFor } from './helpers.js';

let running: RunningInstanceServer;
let url: string;

const mobs = loadMobCatalog();
// Стартовые HP — из конфига класса-заглушки (T-020), не из константы комнаты.
const playerClass = loadClassCatalog().get(PLAYER_CLASS_ID);
const PLAYER_MAX_HP = playerClass?.maxHp as number;

before(async () => {
  assert.ok(PLAYER_MAX_HP, 'melee-initiate не в каталоге /content/classes');
  running = await startServer(loadConfig({ INSTANCE_PORT: '0', LOG_LEVEL: 'silent' }));
  url = `ws://127.0.0.1:${running.port}`;
});

after(async () => {
  await running.server.gracefullyShutdown(false);
});

const join = async () => new Client(url).joinOrCreate(INSTANCE_ROOM_NAME, undefined, InstanceState);

type Room = Awaited<ReturnType<typeof join>>;

const mobOf = (room: Room, entityId: string) => room.state.mobs.get(entityId);
const playerOf = (room: Room, sessionId: string) => room.state.players.get(sessionId);

test('моб появляется в state при старте комнаты', async () => {
  const room = await join();
  const spawn = MOB_SPAWNS[0];
  assert.ok(spawn, 'в комнате должен быть хотя бы один спавн');
  const config = mobs.get(spawn.mobId);
  assert.ok(config, 'rust-scout не в каталоге /content/mobs');

  const entityId = `${spawn.mobId}#1`;
  await waitFor(() => mobOf(room, entityId) !== undefined, 'моб не появился в state');
  const mob = mobOf(room, entityId);
  assert.ok(mob);
  assert.equal(mob.mobId, config.id);
  assert.equal(mob.hp, config.hp);
  assert.equal(mob.x, spawn.x);
  assert.equal(mob.targetId, '', 'игрок на спавне вне радиуса агро — цели нет');

  await room.leave(true);
});

test('агро и атака по таймеру: вход в радиус — цель, урон по state игрока; выход за радиус — сброс', async () => {
  const room = await join();
  const spawn = MOB_SPAWNS[0];
  assert.ok(spawn, 'в комнате должен быть хотя бы один спавн');
  const entityId = `${spawn.mobId}#1`;
  await waitFor(() => mobOf(room, entityId) !== undefined, 'моб не появился в state');
  const config = mobs.get(spawn.mobId);
  assert.ok(config);

  // Игрок заходит в упор к спавну (дистанция 1 < aggroRadius и < дистанции удара).
  room.send('intent.move', { dx: 7, dy: 0 });
  await waitFor(
    () => mobOf(room, entityId)?.targetId === room.sessionId,
    'моб не выбрал целью игрока вошедшего в радиус агро',
  );

  await waitFor(
    () => (playerOf(room, room.sessionId)?.hp ?? PLAYER_MAX_HP) < PLAYER_MAX_HP,
    'моб не нанёс урон в state игрока',
  );
  const hp = playerOf(room, room.sessionId)?.hp;
  assert.ok(hp !== undefined);
  assert.equal((PLAYER_MAX_HP - hp) % config.damage, 0, 'урон крата damage из конфига');

  // Выход за resetRadius агро (моб у 6..8, игрок уходит левее спавна): цель сброшена,
  // урон прекращён. Внутри resetRadius цель бы удерживалась (гистерезис, T-020).
  room.send('intent.move', { dx: -(config.resetRadius + 5), dy: 0 });
  await waitFor(
    () => mobOf(room, entityId)?.targetId === '',
    'моб не потерял цель после выхода игрока за resetRadius',
  );
  const hpAfterLeash = playerOf(room, room.sessionId)?.hp;
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(playerOf(room, room.sessionId)?.hp, hpAfterLeash, 'после сброса агро урон не идёт');

  await room.leave(true);
});
