import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { Client } from '@colyseus/sdk';
import type { DamageInstance } from '@game/shared';

import { loadAbilityCatalog } from '../src/abilityCatalog.js';
import { loadConfig } from '../src/config.js';
import { INSTANCE_ROOM_NAME, startServer, type RunningInstanceServer } from '../src/index.js';
import { BaseInstanceRoom, MOB_SPAWNS } from '../src/rooms/baseInstanceRoom.js';
import { InstanceState } from '../src/state.js';
import { waitFor } from './helpers.js';

let running: RunningInstanceServer;
let url: string;
let fakeNowMs = 1_000_000;

before(async () => {
  BaseInstanceRoom.now = () => fakeNowMs;
  running = await startServer(loadConfig({ INSTANCE_PORT: '0', LOG_LEVEL: 'silent' }));
  url = `ws://127.0.0.1:${running.port}`;
});

after(async () => {
  await running.server.gracefullyShutdown(false);
  BaseInstanceRoom.now = () => Date.now();
});

test('integration: repeated attacks reduce a mob to zero HP', async () => {
  const room = await new Client(url).joinOrCreate(INSTANCE_ROOM_NAME, undefined, InstanceState);
  const damageEvents: DamageInstance[] = [];
  room.onMessage<DamageInstance>('event.damage', (event) => damageEvents.push(event));

  await waitFor(() => room.state.players.has(room.sessionId), 'игрок не появился в state');
  const spawn = MOB_SPAWNS[0];
  assert.ok(spawn);
  const entityId = `${spawn.mobId}#1`;
  await waitFor(() => room.state.mobs.has(entityId), 'моб не появился в state');

  room.send('intent.move', { dx: 7, dy: 0 });
  await waitFor(
    () => room.state.mobs.get(entityId)?.targetId === room.sessionId,
    'моб не выбрал игрока целью после входа в радиус агро',
  );

  const ability = loadAbilityCatalog().get('rust-jab');
  assert.ok(ability);
  let previousHp = room.state.mobs.get(entityId)?.hp;
  assert.ok(previousHp !== undefined);
  let attacks = 0;
  while (previousHp > 0) {
    room.send('intent.ability', { abilityId: ability.id });
    attacks += 1;
    await waitFor(
      () => (room.state.mobs.get(entityId)?.hp ?? previousHp) < previousHp,
      `атака ${attacks} не уменьшила HP моба`,
    );
    previousHp = room.state.mobs.get(entityId)?.hp ?? 0;
    if (previousHp > 0) {
      fakeNowMs += ability.cooldownMs;
      await new Promise((resolve) => setTimeout(resolve, 125));
    }
  }

  assert.ok(attacks > 1, 'моб должен получить несколько атак');
  assert.ok(damageEvents.some((event) => event.target.entityId === entityId));
  assert.ok((room.state.mobs.get(entityId)?.hp ?? 1) <= 0);
  await room.leave(true);
});
