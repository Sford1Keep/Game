import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { Client } from '@colyseus/sdk';

import { loadConfig } from '../src/config.js';
import { INSTANCE_ROOM_NAME, startServer, type RunningInstanceServer } from '../src/index.js';
import { InstanceState, SPAWN_POINT } from '../src/state.js';
import { waitFor } from './helpers.js';

let running: RunningInstanceServer;
let url: string;

before(async () => {
  // port 0 — ОС выдаёт свободный порт, тесты не конфликтууют с dev-запуском.
  running = await startServer(loadConfig({ INSTANCE_PORT: '0' }));
  url = `ws://127.0.0.1:${running.port}`;
});

after(async () => {
  await running.server.gracefullyShutdown(false);
});

test('игрок появляется в state при join и пропадает при leave', async () => {
  const clientA = new Client(url);
  const roomA = await clientA.joinOrCreate(INSTANCE_ROOM_NAME, undefined, InstanceState);

  // Join: своё присутствие видно в state с координатами спавна.
  await waitFor(
    () => roomA.state.players.has(roomA.sessionId),
    'игрок не появился в state после join',
  );
  const self = roomA.state.players.get(roomA.sessionId);
  assert.equal(self?.x, SPAWN_POINT.x);
  assert.equal(self?.y, SPAWN_POINT.y);

  // Второй игрок: его entry реплицируется первому клиенту.
  const clientB = new Client(url);
  const roomB = await clientB.joinOrCreate(INSTANCE_ROOM_NAME, undefined, InstanceState);
  await waitFor(
    () => roomA.state.players.has(roomB.sessionId),
    'второй игрок не появился в state первого',
  );

  // Leave: entry удаляется из state оставшегося клиента.
  await roomB.leave(true /* consented: осознанный выход, без реконнекта */);
  await waitFor(
    () => !roomA.state.players.has(roomB.sessionId),
    'вышедший игрок не пропал из state',
  );
  assert.ok(roomA.state.players.has(roomA.sessionId));

  await roomA.leave(true);
});
